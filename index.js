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
    const allNames = await fetchNamesOfAllah();
    const userProgress = await getUserProgress(userId);
    let availableQuestions = allNames.filter(n => !userProgress.askedQuestions.includes(n.name));
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

const userSessions = {};

bot.hears('Start Quiz', async (ctx) => {
    const userId = ctx.from.id;
    await saveUsername(userId, ctx.from.username || `User${userId}`);
    const { selectedQuestions, askedQuestions } = await generateQuiz(userId);
    userSessions[userId] = { questions: selectedQuestions, current: 0, score: 0, askedQuestions };
    sendQuestion(ctx, userId);
});

async function sendQuestion(ctx, userId) {
    const session = userSessions[userId];
    if (!session || session.current >= session.questions.length) {
        ctx.reply(`Quiz finished! Your score: ${session?.score || 0}/10`);
        await updateUserProgress(userId, session.score, session.askedQuestions);
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
        `What is the meaning of *${question.name}*?`,
        Markup.inlineKeyboard(
            options.map((opt) => [
                Markup.button.callback(opt.meaning, `answer_${userId}_${opt.name === question.name}`)
            ])
        )
    );

    // Set a timeout for 10 seconds
    session.timer = setTimeout(async () => {
        ctx.reply("⏳ Time's up! Moving to the next question.");
        session.current++;
        sendQuestion(ctx, userId);
    }, 10000); // 10 seconds
}

bot.action(/answer_(\d+)_(true|false)/, async (ctx) => {
    const userId = parseInt(ctx.match[1]);
    const correct = ctx.match[2] === 'true';

    if (!userSessions[userId]) return;

    // Clear the timeout since the user answered
    clearTimeout(userSessions[userId].timer);

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
    ctx.reply(`Your current score: ${progress.score}`);
});

bot.hears('Leaderboard', async (ctx) => {
    const leaderboardSnap = await getDocs(collection(db, "user_progress"));
    let leaderboard = [];
    for (const docSnap of leaderboardSnap.docs) {
        const data = docSnap.data();
        const username = await getUsername(docSnap.id);
        leaderboard.push({ username, score: data.score });
    }
    leaderboard.sort((a, b) => b.score - a.score);
    const message = "🏆 Leaderboard 🏆\n\n" +
        leaderboard.slice(0, 5).map((entry, i) => `${i + 1}. @${entry.username}: ${entry.score} points`).join('\n');
    ctx.reply(message);
});

bot.launch();

// Express Server for Render Keep-Alive
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
