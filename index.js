import express from 'express';
import { Telegraf, Markup } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
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

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

async function fetchNamesOfAllah() {
  const namesCollection = collection(db, "namesOfAllah");
  const snapshot = await getDocs(namesCollection);
  return snapshot.docs.map(doc => doc.data());
}

async function getUserProgress(userId) {
  const userRef = doc(db, "user_progress", userId.toString());
  const userSnap = await getDoc(userRef);
  return userSnap.exists() ? userSnap.data() : { level: 1, score: 0, askedQuestions: [] };
}

async function updateUserProgress(userId, level, score, askedQuestions) {
  await setDoc(doc(db, "user_progress", userId.toString()), { level, score, askedQuestions });
}

const userSessions = {};

bot.start((ctx) => {
  ctx.reply(
    "Welcome to Asmaul Husna Quiz!",
    Markup.keyboard([['Start Quiz'], ['User Progress', 'Leaderboard'], ['Quit Quiz']]).resize()
  );
});

bot.hears('Start Quiz', async (ctx) => {
  const userId = ctx.from.id;
  const progress = await getUserProgress(userId);
  const level = progress.level || 1;
  const { selectedQuestions, askedQuestions } = await generateQuiz(level, progress.askedQuestions);
  userSessions[userId] = { questions: selectedQuestions, current: 0, score: 0, askedQuestions, level };
  sendQuestion(ctx, userId);
});

async function generateQuiz(level, askedQuestions) {
  const allNames = await fetchNamesOfAllah();
  const availableQuestions = allNames.filter(n => !askedQuestions.includes(n.name));
  const selectedQuestions = availableQuestions.sort(() => 0.5 - Math.random()).slice(0, 10);
  return { selectedQuestions, askedQuestions: selectedQuestions.map(q => q.name) };
}

async function sendQuestion(ctx, userId) {
  const session = userSessions[userId];
  if (!session || session.current >= session.questions.length) {
    const newLevel = session.score >= 5 ? session.level + 1 : session.level;
    ctx.reply(`Quiz finished! Your score: ${session.score}/10. Your level: ${newLevel}`);
    await updateUserProgress(userId, newLevel, session.score, session.askedQuestions);
    delete userSessions[userId];
    return;
  }
  const question = session.questions[session.current];
  let options = (await fetchNamesOfAllah())
    .filter(n => n.name !== question.name)
    .sort(() => 0.5 - Math.random())
    .slice(0, 3);
  options.push(question);
  options = options.sort(() => 0.5 - Math.random());

  ctx.reply(
    `What is the meaning of *${question.name}*?\n\n⏳ You have 10s to answer!`,
    Markup.inlineKeyboard(
      options.map((opt) => [Markup.button.callback(opt.meaning, `answer_${userId}_${opt.name === question.name}`)])
    )
  );
  
  startCountdown(ctx, userId);
}

async function startCountdown(ctx, userId) {
  let timeLeft = 10;
  const session = userSessions[userId];
  if (!session) return;

  const interval = setInterval(async () => {
    if (!userSessions[userId] || session.current >= session.questions.length) {
      clearInterval(interval);
      return;
    }
    if (timeLeft > 0) {
      ctx.reply(`⏳ Time left: ${timeLeft}s`);
      timeLeft--;
    } else {
      clearInterval(interval);
      ctx.reply("⏰ Time's up! Moving to next question.");
      session.current++;
      sendQuestion(ctx, userId);
    }
  }, 1000);
}

bot.action(/answer_(\d+)_(true|false)/, async (ctx) => {
  const userId = parseInt(ctx.match[1]);
  const correct = ctx.match[2] === 'true';
  if (!userSessions[userId]) return;
  if (correct) userSessions[userId].score++;
  userSessions[userId].current++;
  ctx.reply(correct ? "✅ Correct!" : "❌ Wrong!");
  sendQuestion(ctx, userId);
});

bot.hears('Quit Quiz', (ctx) => {
  const userId = ctx.from.id;
  delete userSessions[userId];
  ctx.reply("Quiz stopped.", Markup.keyboard([['Start Quiz'], ['User Progress', 'Leaderboard']]).resize());
});

bot.hears('User Progress', async (ctx) => {
  const userId = ctx.from.id;
  const progress = await getUserProgress(userId);
  ctx.reply(`Your current level: ${progress.level} \nYour score: ${progress.score}`);
});

bot.hears('Leaderboard', async (ctx) => {
  const leaderboardSnap = await getDocs(collection(db, "user_progress"));
  let leaderboard = [];
  for (const docSnap of leaderboardSnap.docs) {
    const data = docSnap.data();
    leaderboard.push({ username: docSnap.id, score: data.score });
  }
  leaderboard.sort((a, b) => b.score - a.score);
  const message = "🏆 Leaderboard 🏆\n\n" +
    leaderboard.slice(0, 5).map((entry, i) => `${i + 1}. ${entry.username}: ${entry.score} points`).join('\n');
  ctx.reply(message);
});

bot.launch();

// Express Server for Render Keep-Alive
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
