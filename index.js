import { Telegraf } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config();

// Telegram Bot Token
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Firebase Configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Function to fetch the 99 Names of Allah from Firestore
async function fetchNamesOfAllah() {
  const namesCollection = collection(db, "namesOfAllah");
  const snapshot = await getDocs(namesCollection);
  let names = [];
  snapshot.forEach((doc) => {
    names.push(doc.data());
  });
  return names;
}

// Start Command
bot.start(async (ctx) => {
  ctx.reply("Welcome to Asmaul Husna Quest! Learn the 99 Names of Allah and test your knowledge.");
  sendQuestion(ctx);
});

// Send a random question from the names fetched from Firestore
async function sendQuestion(ctx) {
  const names = await fetchNamesOfAllah();
  if (names.length === 0) {
    ctx.reply("No names found in the database.");
    return;
  }

  const randomIndex = Math.floor(Math.random() * names.length);
  const randomName = names[randomIndex];

  ctx.reply(`What is the meaning of **${randomName.name}**?`);
}

// Command to show leaderboard (just a placeholder)
bot.command('leaderboard', async (ctx) => {
  ctx.reply("Leaderboard feature coming soon!");
});

// Start the bot
bot.launch();
