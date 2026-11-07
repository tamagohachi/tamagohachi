#!/usr/bin/env python3
"""Claude Code Stop hook: 作業ごとのトークン数・所要時間を出力し、3行要約ログを残して Slack に通知する。

使い方 (.claude/settings.json から呼ばれる):
  work_report.py metrics   … 同期実行。トークン数と所要時間を systemMessage で画面に必ず表示する
  work_report.py report    … 非同期実行。3行要約を作り、ログに追記し、Slack に通知する

環境変数:
  SLACK_WEBHOOK_URL         Slack Incoming Webhook の URL (未設定なら通知はスキップ)
  WORK_REPORT_SUMMARY_MODEL 要約に使うモデル (既定: haiku)。"off" で LLM 要約を使わず本文から抜粋
  WORK_REPORT_MIN_SECONDS   この秒数未満の作業は Slack 通知しない (既定: 0 = 毎回通知)
"""
import glob
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

GUARD_ENV = "WORK_REPORT_HOOK_RUNNING"  # 要約用 claude -p から再帰的にフックが走るのを防ぐ
JST = timezone(timedelta(hours=9))


def parse_ts(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def load_jsonl(path):
    rows = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        rows.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    except OSError:
        pass
    return rows


def is_human_prompt(row):
    """ツール結果ではない、人間が入力したプロンプトかどうか。"""
    if row.get("type") != "user" or row.get("isMeta") or row.get("isSidechain"):
        return False
    content = (row.get("message") or {}).get("content")
    if isinstance(content, str):
        return not content.startswith("<command-") and not content.startswith("<local-command")
    if isinstance(content, list):
        return any(isinstance(c, dict) and c.get("type") == "text" for c in content) and not any(
            isinstance(c, dict) and c.get("type") == "tool_result" for c in content
        )
    return False


def sum_usage(rows, start=None):
    """assistant メッセージの usage を message.id で重複排除して合計する。"""
    seen = {}
    for r in rows:
        if r.get("type") != "assistant":
            continue
        ts = parse_ts(r.get("timestamp", ""))
        if start and ts and ts < start:
            continue
        msg = r.get("message") or {}
        u = msg.get("usage")
        if not u:
            continue
        seen[msg.get("id") or r.get("uuid")] = u
    t = {"input": 0, "cache_write": 0, "cache_read": 0, "output": 0, "calls": len(seen)}
    for u in seen.values():
        t["input"] += u.get("input_tokens", 0) or 0
        t["cache_write"] += u.get("cache_creation_input_tokens", 0) or 0
        t["cache_read"] += u.get("cache_read_input_tokens", 0) or 0
        t["output"] += u.get("output_tokens", 0) or 0
    t["total"] = t["input"] + t["cache_write"] + t["cache_read"] + t["output"]
    return t


def add_usage(a, b):
    return {k: a.get(k, 0) + b.get(k, 0) for k in set(a) | set(b)}


def last_text(rows):
    for r in reversed(rows):
        if r.get("type") == "assistant":
            for c in reversed((r.get("message") or {}).get("content") or []):
                if isinstance(c, dict) and c.get("type") == "text" and c.get("text", "").strip():
                    return c["text"].strip()
    return ""


def prompt_text(row):
    content = (row.get("message") or {}).get("content")
    if isinstance(content, str):
        return content
    return "\n".join(c.get("text", "") for c in content or [] if isinstance(c, dict) and c.get("type") == "text")


def collect(hook):
    path = hook.get("transcript_path", "")
    rows = load_jsonl(path)
    session_id = hook.get("session_id", "")

    prompts = [i for i, r in enumerate(rows) if is_human_prompt(r)]
    first_idx = prompts[-1] if prompts else 0
    turn_rows = rows[first_idx:]
    start = parse_ts(rows[first_idx].get("timestamp", "")) if rows else None
    end = None
    for r in reversed(rows):
        end = parse_ts(r.get("timestamp", "") or "")
        if end:
            break
    end = end or datetime.now(timezone.utc)

    turn = sum_usage(turn_rows)
    session = sum_usage(rows)

    # サブエージェントの transcript (<session>/subagents/*.jsonl) も合算する
    sub_dir = os.path.join(os.path.splitext(path)[0], "subagents")
    for sp in glob.glob(os.path.join(sub_dir, "*.jsonl")):
        srows = load_jsonl(sp)
        session = add_usage(session, sum_usage(srows))
        turn = add_usage(turn, sum_usage(srows, start=start))

    session_start = None
    for r in rows:
        session_start = parse_ts(r.get("timestamp", "") or "")
        if session_start:
            break

    elapsed = max(0, int((end - start).total_seconds())) if start else 0
    session_elapsed = max(0, int((end - session_start).total_seconds())) if session_start else 0

    last_msg = hook.get("last_assistant_message") or last_text(turn_rows)
    return {
        "session_id": session_id,
        "cwd": hook.get("cwd", os.getcwd()),
        "start": start.astimezone(JST).isoformat(timespec="seconds") if start else None,
        "end": end.astimezone(JST).isoformat(timespec="seconds"),
        "elapsed_sec": elapsed,
        "session_elapsed_sec": session_elapsed,
        "turn": turn,
        "session": session,
        "prompt": prompt_text(rows[first_idx]) if prompts else "",
        "last_message": last_msg,
    }


def fmt_dur(sec):
    h, rem = divmod(int(sec), 3600)
    m, s = divmod(rem, 60)
    return f"{h}時間{m}分{s}秒（合計 {sec / 60:.1f} 分 / {sec / 3600:.2f} 時間）"


def fmt_tokens(t):
    return (
        f"{t['total']:,} トークン（入力 {t['input']:,} / キャッシュ書込 {t['cache_write']:,} / "
        f"キャッシュ読込 {t['cache_read']:,} / 出力 {t['output']:,}、API呼出 {t['calls']} 回）"
    )


def metrics_text(d):
    return (
        "📊 作業レポート\n"
        f"・使用トークン: {fmt_tokens(d['turn'])}\n"
        f"・所要時間: {fmt_dur(d['elapsed_sec'])}\n"
        f"・セッション累計: {d['session']['total']:,} トークン / {fmt_dur(d['session_elapsed_sec'])}"
    )


def summarize(d):
    """3行要約を作る。claude -p (既定 haiku) を使い、失敗したら本文から抜粋。"""
    model = os.environ.get("WORK_REPORT_SUMMARY_MODEL", "haiku")
    if model != "off" and d["last_message"]:
        prompt = (
            "以下は Claude Code の作業の依頼と最終報告です。実施した作業を日本語でちょうど3行に要約してください。"
            "各行は「・」で始め、60文字以内。前置きや後書きは不要で、3行だけを出力してください。\n\n"
            f"## 依頼\n{d['prompt'][:3000]}\n\n## 最終報告\n{d['last_message'][:8000]}"
        )
        try:
            env = dict(os.environ, **{GUARD_ENV: "1"})
            out = subprocess.run(
                ["claude", "-p", "--model", model, "--output-format", "text"],
                input=prompt, capture_output=True, text=True, timeout=120, env=env,
            ).stdout.strip()
            lines = [l.strip() for l in out.splitlines() if l.strip()]
            if len(lines) >= 3:
                return [l if l.startswith("・") else "・" + l.lstrip("-* ") for l in lines[:3]]
        except Exception:
            pass
    src = [l.strip().lstrip("#-*• ").strip() for l in (d["last_message"] or "").splitlines()]
    src = [l for l in src if l]
    while len(src) < 3:
        src.append("(記載なし)")
    return ["・" + l[:60] for l in src[:3]]


def write_log(d, summary):
    log_dir = os.path.join(os.environ.get("CLAUDE_PROJECT_DIR", d["cwd"]), ".claude", "logs")
    os.makedirs(log_dir, exist_ok=True)
    rec = {k: d[k] for k in ("session_id", "start", "end", "elapsed_sec", "turn", "session")}
    rec["summary"] = summary
    with open(os.path.join(log_dir, "work-log.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    with open(os.path.join(log_dir, "work-log.md"), "a", encoding="utf-8") as f:
        f.write(
            f"## {d['end']}  (session {d['session_id'][:8]})\n"
            + "\n".join(summary)
            + f"\n- トークン: {fmt_tokens(d['turn'])}\n- 所要時間: {fmt_dur(d['elapsed_sec'])}\n\n"
        )


def notify_slack(d, summary):
    url = os.environ.get("SLACK_WEBHOOK_URL")
    if not url:
        return "SLACK_WEBHOOK_URL 未設定のため Slack 通知をスキップ"
    if d["elapsed_sec"] < int(os.environ.get("WORK_REPORT_MIN_SECONDS", "0")):
        return "所要時間がしきい値未満のため Slack 通知をスキップ"
    repo = os.path.basename(d["cwd"].rstrip("/"))
    text = (
        f"*🤖 Claude Code 作業完了* (`{repo}`)\n"
        + "\n".join(summary)
        + f"\n\n• 使用トークン: {fmt_tokens(d['turn'])}\n• 所要時間: {fmt_dur(d['elapsed_sec'])}\n"
        f"• 終了: {d['end']}"
    )
    req = urllib.request.Request(
        url, data=json.dumps({"text": text}).encode(), headers={"Content-Type": "application/json"}
    )
    try:
        urllib.request.urlopen(req, timeout=15).read()
        return "Slack に通知しました"
    except Exception as e:
        return f"Slack 通知に失敗: {e}"


def main():
    if os.environ.get(GUARD_ENV):
        return  # 要約用の claude -p 内では何もしない
    mode = sys.argv[1] if len(sys.argv) > 1 else "metrics"
    try:
        hook = json.load(sys.stdin)
    except Exception:
        hook = {}
    d = collect(hook)
    if mode == "metrics":
        print(json.dumps({"systemMessage": metrics_text(d)}, ensure_ascii=False))
    elif mode == "report":
        summary = summarize(d)
        write_log(d, summary)
        print(notify_slack(d, summary), file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # フックの失敗で作業を止めない
        print(f"work_report hook error: {e}", file=sys.stderr)
    sys.exit(0)
