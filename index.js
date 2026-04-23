const https = require(“https”);
const http = require(“http”);
const fs = require(“fs”);

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHARACTERS_FILE = “./characters.json”;

let characters = {};
try {
const data = fs.readFileSync(CHARACTERS_FILE, “utf8”);
characters = JSON.parse(data);
console.log(“تم تحميل “ + Object.keys(characters).length + “ شخصية”);
} catch (err) {
console.error(“فشل تحميل ملف الشخصيات: “ + err.message);
process.exit(1);
}

let offset = 0;

function fetchJSON(url, options) {
options = options || {};
return new Promise(function(resolve, reject) {
var lib = url.startsWith(“https”) ? https : http;
var req = lib.request(url, { method: options.method || “GET”, headers: options.headers || {} }, function(res) {
var data = “”;
res.on(“data”, function(chunk) { data += chunk; });
res.on(“end”, function() {
try { resolve(JSON.parse(data)); }
catch (e) { reject(new Error(“parse error”)); }
});
});
req.on(“error”, reject);
if (options.body) req.write(options.body);
req.end();
});
}

function sendMessage(chatId, text, replyMarkup) {
var url = “https://api.telegram.org/bot” + BOT_TOKEN + “/sendMessage”;
var body = { chat_id: chatId, text: text };
if (replyMarkup) body.reply_markup = replyMarkup;
return fetchJSON(url, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify(body)
});
}

function sendInlineKeyboard(chatId, text, buttons) {
var replyMarkup = {
inline_keyboard: buttons.map(function(row) {
return row.map(function(btn) {
return { text: btn.text, callback_data: btn.callback_data };
});
})
};
return sendMessage(chatId, text, replyMarkup);
}

function getUpdates() {
var url = “https://api.telegram.org/bot” + BOT_TOKEN + “/getUpdates?timeout=10&offset=” + offset + “&allowed_updates=%5B%22message%22%2C%22callback_query%22%5D”;
return fetchJSON(url);
}

function answerCallbackQuery(callbackId, text) {
var url = “https://api.telegram.org/bot” + BOT_TOKEN + “/answerCallbackQuery”;
return fetchJSON(url, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({ callback_query_id: callbackId, text: text })
});
}

function getCharacterDetails(key) {
var c = characters[key];
if (!c) return null;
var text = c.name + “\n”;
text += “الفئة: “ + c.category + “\n\n”;
text += “الوصف:\n” + c.description + “\n\n”;
text += “تفاصيل اضافية:\n” + c.details + “\n\n”;
text += “اقتباس:\n” + c.quote + “\n\n”;
text += “هل تصدقه؟ ام ستغلق الباب؟”;
return text;
}

function handleMessage(chatId, text, messageId) {
var lowerText = text.toLowerCase().trim();

if (lowerText === “/start”) {
var buttons = [
[{ text: “قائمة الشخصيات”, callback_data: “list_all” }],
[{ text: “شخصية عشوائية”, callback_data: “random_char” }],
[{ text: “اوامر المساعدة”, callback_data: “help” }]
];
return sendInlineKeyboard(chatId, “مرحبا بك في بوت شخصيات لعبة No I’m not a Human\n\nاختر من الازرار ادناه:”, buttons);
}

if (lowerText === “/help”) {
var helpText = “الاوامر المتاحة:\n/start - القائمة الرئيسية\n/characters - عرض اسماء الشخصيات\n/random - شخصية عشوائية\n\nاو اكتب اسم شخصية مباشرة”;
return sendMessage(chatId, helpText);
}

if (lowerText === “/characters”) {
var list = “قائمة الشخصيات:\n\n”;
var names = Object.keys(characters);
names.forEach(function(key, idx) {
list += (idx + 1) + “. “ + characters[key].name + “ (” + characters[key].category + “)\n”;
});
list += “\nارسل اسم الشخصية لمعرفة التفاصيل.”;
return sendMessage(chatId, list);
}

if (lowerText === “/random”) {
var keys = Object.keys(characters);
var randomKey = keys[Math.floor(Math.random() * keys.length)];
return sendMessage(chatId, getCharacterDetails(randomKey));
}

var foundKey = null;
var key, name;
for (key in characters) {
name = characters[key].name.toLowerCase();
if (name === lowerText || key.toLowerCase() === lowerText) {
foundKey = key;
break;
}
}
if (!foundKey) {
for (key in characters) {
name = characters[key].name.toLowerCase();
if (name.includes(lowerText) || lowerText.includes(name)) {
foundKey = key;
break;
}
}
}

if (foundKey) {
return sendMessage(chatId, getCharacterDetails(foundKey));
} else {
return sendMessage(chatId, “لم اجد هذه الشخصية. اكتب /characters لعرض القائمة الكاملة.”);
}
}

function handleCallback(chatId, callbackId, data) {
var p;
if (data === “list_all”) {
var list = “قائمة الشخصيات:\n\n”;
var names = Object.keys(characters);
for (var i = 0; i < names.length; i++) {
list += (i + 1) + “. “ + characters[names[i]].name + “ (” + characters[names[i]].category + “)\n”;
}
list += “\nيمكنك الان كتابة اسم الشخصية.”;
p = sendMessage(chatId, list);
} else if (data === “random_char”) {
var keys = Object.keys(characters);
var randomKey = keys[Math.floor(Math.random() * keys.length)];
p = sendMessage(chatId, getCharacterDetails(randomKey));
} else if (data === “help”) {
p = sendMessage(chatId, “الاوامر:\n/start - القائمة\n/characters - عرض الاسماء\n/random - شخصية عشوائية\n\nاو اكتب اسم شخصية.”);
} else {
p = Promise.resolve();
}
return p.then(function() {
return answerCallbackQuery(callbackId, “”);
});
}

function poll() {
getUpdates().then(function(data) {
if (!data.ok) {
console.error(“Telegram API error: “ + data.description);
setTimeout(poll, 3000);
return Promise.resolve();
}
var promise = Promise.resolve();
data.result.forEach(function(update) {
offset = update.update_id + 1;
promise = promise.then(function() {
if (update.message && update.message.text && !update.message.from.is_bot) {
console.log(”[MSG from “ + update.message.chat.id + “]: “ + update.message.text);
return handleMessage(update.message.chat.id, update.message.text, update.message.message_id);
}
if (update.callback_query) {
console.log(”[CB from “ + update.callback_query.message.chat.id + “]: “ + update.callback_query.data);
return handleCallback(update.callback_query.message.chat.id, update.callback_query.id, update.callback_query.data);
}
});
});
return promise;
}).catch(function(err) {
console.error(”[Poll error] “ + err.message);
}).then(function() {
setTimeout(poll, 1500);
});
}

var PORT = process.env.PORT || 3000;
http.createServer(function(req, res) {
res.writeHead(200, { “Content-Type”: “text/plain” });
res.end(“Bot is running!”);
}).listen(PORT, function() {
console.log(“HTTP server listening on port “ + PORT);
console.log(“Bot polling started…”);
poll();
});
