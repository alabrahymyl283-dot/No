const https = require("https");
const http = require(“http”);
const fs = require(“fs”);

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHARACTERS_FILE = “./characters.json”;

// قراءة بيانات الشخصيات
let characters = {};
try {
const data = fs.readFileSync(CHARACTERS_FILE, “utf8”);
characters = JSON.parse(data);
console.log(`✅ تم تحميل ${Object.keys(characters).length} شخصية`);
} catch (err) {
console.error(“❌ فشل تحميل ملف الشخصيات:”, err.message);
process.exit(1);
}

let offset = 0;

// دوال مساعدة للـ HTTP
function fetchJSON(url, options = {}) {
return new Promise((resolve, reject) => {
const lib = url.startsWith(“https”) ? https : http;
const req = lib.request(url, { method: options.method || “GET”, headers: options.headers || {} }, (res) => {
let data = “”;
res.on(“data”, chunk => data += chunk);
res.on(“end”, () => {
try { resolve(JSON.parse(data)); }
catch (e) { reject(new Error(“parse error”)); }
});
});
req.on(“error”, reject);
if (options.body) req.write(options.body);
req.end();
});
}

// إرسال رسالة نصية
async function sendMessage(chatId, text, replyMarkup = null) {
const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
const body = { chat_id: chatId, text };
if (replyMarkup) body.reply_markup = replyMarkup;
return fetchJSON(url, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify(body)
});
}

// إرسال رسالة مع أزرار Inline
async function sendInlineKeyboard(chatId, text, buttons) {
const replyMarkup = {
inline_keyboard: buttons.map(row => row.map(btn => ({ text: btn.text, callback_data: btn.callback_data })))
};
return sendMessage(chatId, text, replyMarkup);
}

// الحصول على التحديثات
async function getUpdates() {
const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?timeout=10&offset=${offset}&allowed_updates=["message","callback_query"]`;
return fetchJSON(url);
}

// الرد على استعلام الأزرار (callback_query)
async function answerCallbackQuery(callbackId, text) {
const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`;
return fetchJSON(url, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({ callback_query_id: callbackId, text })
});
}

// إنشاء نص تفاصيل الشخصية
function getCharacterDetails(key) {
const c = characters[key];
if (!c) return null;
let text = `🎭 *${c.name}*\n`;
text += `🏷️ الفئة: ${c.category}\n\n`;
text += `📖 *الوصف:*\n${c.description}\n\n`;
text += `🔍 *تفاصيل إضافية:*\n${c.details}\n\n`;
text += `💬 *اقتباس:*\n"${c.quote}"\n\n`;
text += `_هل تصدقه؟ أم ستغلق الباب؟_`;
return text;
}

// معالجة الأوامر والرسائل
async function handleMessage(chatId, text, messageId) {
const lowerText = text.toLowerCase().trim();

// أمر /start
if (lowerText === “/start”) {
const buttons = [
[{ text: “📋 قائمة الشخصيات”, callback_data: “list_all” }],
[{ text: “🎲 شخصية عشوائية”, callback_data: “random_char” }],
[{ text: “❓ أوامر المساعدة”, callback_data: “help” }]
];
await sendInlineKeyboard(chatId, “👋 مرحباً بك في بوت شخصيات لعبة *No, I’m not a Human*!\n\nاختر من الأزرار أدناه:”, buttons);
return;
}

// أمر /help
if (lowerText === “/help”) {
const helpText = “📖 *الأوامر المتاحة:*\n/start - القائمة الرئيسية\n/characters - عرض أسماء الشخصيات\n/random - شخصية عشوائية\n\nأو اكتب اسم شخصية مباشرة (مثال: الزائر)”;
await sendMessage(chatId, helpText);
return;
}

// أمر /characters
if (lowerText === “/characters”) {
let list = “📋 *قائمة الشخصيات:*\n\n”;
const names = Object.keys(characters);
names.forEach((key, idx) => {
list += `${idx+1}. ${characters[key].name} (${characters[key].category})\n`;
});
list += “\nأرسل اسم الشخصية لمعرفة التفاصيل.”;
await sendMessage(chatId, list);
return;
}

// أمر /random
if (lowerText === “/random”) {
const keys = Object.keys(characters);
const randomKey = keys[Math.floor(Math.random() * keys.length)];
const details = getCharacterDetails(randomKey);
await sendMessage(chatId, details);
return;
}

// البحث عن شخصية حسب النص المدخل (مطابقة تامة أو جزئية)
let foundKey = null;
for (const key in characters) {
const name = characters[key].name.toLowerCase();
if (name === lowerText || key.toLowerCase() === lowerText) {
foundKey = key;
break;
}
}
if (!foundKey) {
// بحث جزئي (أول كلمة)
for (const key in characters) {
const name = characters[key].name.toLowerCase();
if (name.includes(lowerText) || lowerText.includes(name)) {
foundKey = key;
break;
}
}
}

if (foundKey) {
const details = getCharacterDetails(foundKey);
await sendMessage(chatId, details);
} else {
await sendMessage(chatId, “❓ لم أجد هذه الشخصية. اكتب /characters لعرض القائمة الكاملة.”);
}
}

// معالجة ضغط الأزرار (callback_query)
async function handleCallback(chatId, callbackId, data) {
if (data === “list_all”) {
let list = “📋 *قائمة الشخصيات:*\n\n”;
const names = Object.keys(characters);
for (let i = 0; i < names.length; i++) {
const key = names[i];
list += `${i+1}. ${characters[key].name} (${characters[key].category})\n`;
}
list += “\nيمكنك الآن كتابة اسم الشخصية.”;
await sendMessage(chatId, list);
}
else if (data === “random_char”) {
const keys = Object.keys(characters);
const randomKey = keys[Math.floor(Math.random() * keys.length)];
const details = getCharacterDetails(randomKey);
await sendMessage(chatId, details);
}
else if (data === “help”) {
const helpText = “📖 *الأوامر:*\n/start - القائمة\n/characters - عرض الأسماء\n/random - شخصية عشوائية\n\nأو اكتب اسم شخصية.”;
await sendMessage(chatId, helpText);
}
await answerCallbackQuery(callbackId, “”);
}

// حلقة الـ Polling
async function poll() {
try {
const data = await getUpdates();
if (!data.ok) {
console.error(“Telegram API error:”, data.description);
setTimeout(poll, 3000);
return;
}
for (const update of data.result) {
offset = update.update_id + 1;

```
  // معالجة الرسائل النصية
  if (update.message && update.message.text && !update.message.from?.is_bot) {
    const chatId = update.message.chat.id;
    const text = update.message.text;
    console.log(`[MSG from ${chatId}]: ${text}`);
    await handleMessage(chatId, text, update.message.message_id);
  }
  
  // معالجة ضغط الأزرار
  if (update.callback_query) {
    const callback = update.callback_query;
    const chatId = callback.message.chat.id;
    const callbackId = callback.id;
    const data = callback.data;
    console.log(`[CB from ${chatId}]: ${data}`);
    await handleCallback(chatId, callbackId, data);
  }
}
```

} catch (err) {
console.error(”[Poll error]”, err.message);
}
setTimeout(poll, 1500);
}

// إنشاء خادم HTTP صحي (لـ Render/Heroku)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
res.writeHead(200, { “Content-Type”: “text/plain” });
res.end(“Bot is running!”);
}).listen(PORT, () => {
console.log(`✅ HTTP server listening on port ${PORT}`);
console.log(“🤖 Bot polling started…”);
poll();
});
