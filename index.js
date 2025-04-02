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

const userSessions = {};

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

async function updateUserProgress(userId, username, level, score, askedQuestions) {
    await setDoc(doc(db, "user_progress", userId.toString()), { username, level, score, askedQuestions });
}

async function getUsername(userId) {
    const userRef = doc(db, "user_progress", userId.toString());
    const userSnap = await getDoc(userRef);
    return userSnap.exists() ? userSnap.data().username || `User${userId}` : `User${userId}`;
}

async function generateQuiz(userId) {
    const allNames = await fetchNamesOfAllah();
    const userProgress = await getUserProgress(userId);
    const level = userProgress.level;

    let levelQuestions = allNames.filter(n => n.level === level && !userProgress.askedQuestions.includes(n.name));
    if (levelQuestions.length < 10) levelQuestions = allNames.filter(n => n.level === level);
    let selectedQuestions = levelQuestions.sort(() => 0.5 - Math.random()).slice(0, 10);
    
    return { selectedQuestions, askedQuestions: selectedQuestions.map(q => q.name) };
}

bot.start((ctx) => {
    ctx.reply(
        "Welcome to Asmaul Husna Quiz!",
        Markup.keyboard([['Start Quiz'], ['User Progress', 'Leaderboard'], ['Quit Quiz']]).resize()
    );
});

bot.hears('Start Quiz', async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || `User${userId}`;
    const { selectedQuestions, askedQuestions } = await generateQuiz(userId);
    userSessions[userId] = { username, questions: selectedQuestions, current: 0, score: 0, askedQuestions };
    sendQuestion(ctx, userId);
});

async function sendQuestion(ctx, userId) {
    const session = userSessions[userId];
    if (!session || session.current >= session.questions.length) {
        ctx.reply(`Quiz finished! Your score: ${session?.score || 0}/10`);
        const userProgress = await getUserProgress(userId);
        const newLevel = session.score >= 5 ? userProgress.level + 1 : userProgress.level;
        await updateUserProgress(userId, session.username, newLevel, session.score, session.askedQuestions);
        delete userSessions[userId];
        return;
    }

    const question = session.questions[session.current];
    let options = (await fetchNamesOfAllah()).filter(n => n.name !== question.name).sort(() => 0.5 - Math.random()).slice(0, 3);
    options.push(question);
    options = options.sort(() => 0.5 - Math.random());
    
    let timeLeft = 10;
    const message = await ctx.replyWithMarkdown(
        `⏳ *${timeLeft}s remaining*\n\nWhat is the meaning of *${question.name}*?`,
        Markup.inlineKeyboard(
            options.map((opt) => [Markup.button.callback(opt.meaning, `answer_${userId}_${opt.name === question.name}`)])
        )
    );

    const timer = setInterval(async () => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(timer);
            session.current++;
            sendQuestion(ctx, userId);
            return;
        }
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, message.message_id, undefined,
                `⏳ *${timeLeft}s remaining*\n\nWhat is the meaning of *${question.name}*?`,
                { parse_mode: "Markdown", reply_markup: message.reply_markup }
            );
        } catch (error) {}
    }, 1000);
}

bot.hears('Leaderboard', async (ctx) => {
    const leaderboardSnap = await getDocs(collection(db, "user_progress"));
    let leaderboard = [];
    for (const docSnap of leaderboardSnap.docs) {
        const data = docSnap.data();
        leaderboard.push({ username: data.username || `User${docSnap.id}`, score: data.score });
    }
    leaderboard.sort((a, b) => b.score - a.score);
    const message = "🏆 Leaderboard 🏆\n\n" + leaderboard.slice(0, 5).map((entry, i) => `${i + 1}. @${entry.username}: ${entry.score} points`).join('\n');
    ctx.reply(message);
});

bot.launch();

// Express Server for Render Keep-Alive
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
