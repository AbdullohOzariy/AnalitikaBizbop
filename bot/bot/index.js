require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);
const MINI_APP_URL = 'https://t.me/bizbopspsbot/app';

bot.start((ctx) => {
  const ism = ctx.from.first_name || 'Xodim';
  ctx.reply(
    `Salom, ${ism}! \nYangi yozuv qo'shish uchun tugmani bosing.`,
    Markup.inlineKeyboard([
      [Markup.button.url('📝 Yangi yozuv', MINI_APP_URL)]
    ])
  );
});

bot.command('panel', (ctx) => {
  const adminIds = process.env.ADMIN_IDS.split(',').map(Number);
  if (!adminIds.includes(ctx.from.id)) {
    return ctx.reply('Ruxsat yo\'q.');
  }
  ctx.reply(
    'Nazorat panel:',
    Markup.inlineKeyboard([
      [Markup.button.url('Panelni ochish', `${process.env.WEBHOOK_URL}/panel`)]
    ])
  );
});

module.exports = bot;
