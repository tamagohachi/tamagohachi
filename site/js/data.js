// サービス名（画像のワードマークに使う）
// [文字, 太さ] の並び。SHOT だけ太くして「プロセス・ショット」の区切りを見せる
export const WORDMARK = [["PROCES", 500], ["SHOT", 900]];
// ワードマークの横に小さく併記する発信元のアカウント
export const HANDLE = "@hakko.3d";

// hero: 画像に載せる主役の行。tag: 主役に親の語が含まれないときラベル行に添える親
export const PROC = [
  { k: "washed", ja: "ウォッシュド", hero: ["WASHED"], subs: [] },
  { k: "natural", ja: "ナチュラル", hero: ["NATURAL"], subs: [
    { k: "anaerobic", ja: "アナエロビック", hero: ["ANAEROBIC", "NATURAL"] },
    { k: "carbonic", ja: "カーボニックマセレーション", hero: ["CARBONIC", "MACERATION"], tag: "NATURAL" },
    { k: "infused", ja: "インフューズド／コーファーメント", hero: ["INFUSED /", "CO-FERMENT"], tag: "NATURAL" },
  ] },
  { k: "honey", ja: "ハニー", hero: ["HONEY"], subs: [
    { k: "yellow", ja: "イエロー", hero: ["YELLOW", "HONEY"] },
    { k: "red", ja: "レッド", hero: ["RED", "HONEY"] },
    { k: "black", ja: "ブラック", hero: ["BLACK", "HONEY"] },
  ] },
  { k: "other", ja: "その他", hero: null, free: true, subs: [
    { k: "thermal", ja: "サーマルショック", hero: ["THERMAL", "SHOCK"] },
    { k: "decaf", ja: "デカフェ", hero: ["DECAF"] },
    { k: "wethulled", ja: "スマトラ式", hero: ["WET-HULLED"] },
  ] },
];

// [画像に出す英語名, 画面に出す日本語名]
export const COUNTRIES = [
  ["Ethiopia", "エチオピア"], ["Kenya", "ケニア"], ["Colombia", "コロンビア"], ["Brazil", "ブラジル"],
  ["Guatemala", "グアテマラ"], ["Costa Rica", "コスタリカ"], ["Panama", "パナマ"], ["Indonesia", "インドネシア"],
  ["India", "インド"], ["Uganda", "ウガンダ"], ["Ecuador", "エクアドル"], ["El Salvador", "エルサルバドル"],
  ["Jamaica", "ジャマイカ"], ["Thailand", "タイ"], ["Tanzania", "タンザニア"], ["China", "中国"],
  ["Nicaragua", "ニカラグア"], ["Japan", "日本"], ["Papua New Guinea", "パプアニューギニア"], ["Hawaii", "ハワイ"],
  ["Timor-Leste", "東ティモール"], ["Burundi", "ブルンジ"], ["Vietnam", "ベトナム"], ["Peru", "ペルー"],
  ["Bolivia", "ボリビア"], ["Honduras", "ホンジュラス"], ["Myanmar", "ミャンマー"], ["Mexico", "メキシコ"],
  ["Yemen", "イエメン"], ["Rwanda", "ルワンダ"],
];
export const TOP8 = COUNTRIES.slice(0, 8).map((c) => c[0]);
export const BLEND = ["Blend", "ブレンド"];
