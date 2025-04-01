import { Telegraf, Markup } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config();

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

async function fetchNamesOfAllah() {
  const namesCollection = collection(db, "namesOfAllah");
  const snapshot = await getDocs(namesCollection);
  let names = [];
  snapshot.forEach((doc) => {
    names.push(doc.data());
  });
  return names;
}

async function getUserProgress(userId) {
  const userRef = doc(db, "user_progress", userId.toString());
  const userSnap = await getDoc(userRef);
  return userSnap.exists() ? userSnap.data() : { score: 0, askedQuestions: [] };
}

async function updateUserProgress(userId, score, askedQuestions) {
  await setDoc(doc(db, "user_progress", userId.toString()), { score, askedQuestions });
}

async function saveUsername(userId, username) {
  if (!username) return;
  await setDoc(doc(db, "usernames", userId.toString()), { username });
}

async function getUsername(userId) {
  const usernameRef = doc(db, "usernames", userId.toString());
  const usernameSnap = await getDoc(usernameRef);
  return usernameSnap.exists() ? usernameSnap.data().username : `User${userId}`;
}

async function generateQuiz(userId) {
  let allNames = await fetchNamesOfAllah();
  let userProgress = await getUserProgress(userId);
  let askedQuestions = userProgress.askedQuestions || [];

  let availableQuestions = allNames.filter(n => !askedQuestions.includes(n.name));
  if (availableQuestions.length < 10) availableQuestions = allNames;

  let selectedQuestions = availableQuestions.sort(() => 0.5 - Math.random()).slice(0, 10);
  return { selectedQuestions, askedQuestions: selectedQuestions.map(q => q.name) };
}

bot.start((ctx) => {
  ctx.reply(
    "Welcome to Asmaul Husna Quiz!",
    Markup.keyboard([['Start Quiz'], ['User Progress', 'Leaderboard'], ['Quit Quiz']]).resize()
  );
});

let userSessions = {};

bot.hears('Start Quiz', async (ctx) => {
  let userId = ctx.from.id;
  let username = ctx.from.username || `User${userId}`;
  await saveUsername(userId, username);
  
  let { selectedQuestions, askedQuestions } = await generateQuiz(userId);
  userSessions[userId] = { questions: selectedQuestions, current: 0, score: 0, askedQuestions };
  sendQuestion(ctx, userId);
});

async function sendQuestion(ctx, userId) {
  let session = userSessions[userId];
  if (!session || session.current >= session.questions.length) {
    ctx.reply(`Quiz finished! Your score: ${session?.score || 0}/10`);
    await updateUserProgress(userId, session.score, session.askedQuestions);
    delete userSessions[userId];
    return;
  }

  let question = session.questions[session.current];
  let allNames = await fetchNamesOfAllah();
  let options = allNames.filter(n => n.name !== question.name).sort(() => 0.5 - Math.random()).slice(0, 3);
  options.push(question);
  options = options.sort(() => 0.5 - Math.random());

  ctx.reply(
    `What is the meaning of *${question.name}*?`,
    Markup.inlineKeyboard(options.map((opt, index) => [Markup.button.callback(opt.meaning, `answer_${userId}_${index}_${opt.name === question.name}`)]))
  );
}

bot.action(/answer_(\d+)_(\d+)_(true|false)/, async (ctx) => {
  let userId = parseInt(ctx.match[1]);
  let correct = ctx.match[3] === 'true';
  
  if (!userSessions[userId]) return;
  if (correct) userSessions[userId].score++;
  userSessions[userId].current++;
  
  ctx.reply(correct ? "✅ Correct!" : "❌ Wrong!");
  sendQuestion(ctx, userId);
});

bot.hears('Quit Quiz', (ctx) => {
  let userId = ctx.from.id;
  delete userSessions[userId];
  ctx.reply("Quiz stopped.", Markup.keyboard([['Start Quiz'], ['User Progress', 'Leaderboard']]).resize());
});

bot.hears('User Progress', async (ctx) => {
  let userId = ctx.from.id;
  let progress = await getUserProgress(userId);
  ctx.reply(`Your current score: ${progress.score}`);
});

bot.hears('Leaderboard', async (ctx) => {
  const leaderboardSnap = await getDocs(collection(db, "user_progress"));
  let leaderboard = [];
  
  for (let docSnap of leaderboardSnap.docs) {
    let data = docSnap.data();
    let userId = docSnap.id;
    let username = await getUsername(userId);
    leaderboard.push({ username, score: data.score });
  }

  leaderboard.sort((a, b) => b.score - a.score);
  
  let message = "🏆 Leaderboard 🏆\n\n";
  leaderboard.slice(0, 5).forEach((entry, i) => {
    message += `${i + 1}. @${entry.username}: ${entry.score} points\n`;
  });

  ctx.reply(message);
});

bot.launch();
