import express from 'express';
import { Telegraf, Markup } from 'telegraf';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Firebase Configuration (remains the same)
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

// --- Firestore Functions (remain the same) ---
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
    // Ensure username is stored correctly, handle potential undefined/null
    const safeUsername = username || `User${userId}`;
    await setDoc(doc(db, "usernames", userId.toString()), { username: safeUsername });
}


async function getUsername(userId) {
    const usernameRef = doc(db, "usernames", userId.toString());
    const usernameSnap = await getDoc(usernameRef);
    // Provide a default if username is missing in DB
    return usernameSnap.exists() ? (usernameSnap.data().username || `User${userId}`) : `User${userId}`;
}


async function generateQuiz(userId) {
    const allNames = await fetchNamesOfAllah();
    const userProgress = await getUserProgress(userId);
    let availableQuestions = allNames.filter(n => !userProgress.askedQuestions.includes(n.name));
    // Ensure enough questions, reset askedQuestions if needed
    if (availableQuestions.length < 10) {
        console.log(`User ${userId}: Not enough unique questions, reusing from all names.`);
        availableQuestions = allNames;
        // Optionally reset user's askedQuestions history here if you want a full reset
        // await updateUserProgress(userId, userProgress.score, []); // Uncomment if full reset desired
    } else {
        console.log(`User ${userId}: Found ${availableQuestions.length} available questions.`);
    }
    let selectedQuestions = availableQuestions.sort(() => 0.5 - Math.random()).slice(0, 10);
    return { selectedQuestions, askedQuestions: selectedQuestions.map(q => q.name) };
}


// --- Bot Logic ---

bot.start((ctx) => {
    ctx.reply(
        "Welcome to Asmaul Husna Quiz!",
        Markup.keyboard([['Start Quiz'], ['User Progress', 'Leaderboard'], ['Quit Quiz']]).resize()
    );
});

const userSessions = {}; // Stores { questions: [], current: 0, score: 0, askedQuestions: [], timerId: null }

bot.hears('Start Quiz', async (ctx) => {
    const userId = ctx.from.id;

    // Clear any previous session/timer if user restarts without quitting
    if (userSessions[userId] && userSessions[userId].timerId) {
        clearTimeout(userSessions[userId].timerId);
    }

    await saveUsername(userId, ctx.from.username); // Save username at start
    try {
        const { selectedQuestions, askedQuestions } = await generateQuiz(userId);
        if (!selectedQuestions || selectedQuestions.length === 0) {
             ctx.reply("Sorry, couldn't load questions right now. Please try again later.");
             return;
        }
        userSessions[userId] = {
            questions: selectedQuestions,
            current: 0,
            score: 0,
            askedQuestions: askedQuestions, // Store the list of questions asked in *this* session
            timerId: null // Initialize timerId
        };
        console.log(`Starting quiz for user ${userId}. Questions: ${selectedQuestions.map(q=>q.name).join(', ')}`);
        await sendQuestion(ctx, userId); // Use await here
    } catch (error) {
        console.error("Error starting quiz:", error);
        ctx.reply("An error occurred while starting the quiz. Please try again.");
    }
});

const QUESTION_TIMEOUT = 10000; // 10 seconds in milliseconds

async function sendQuestion(ctx, userId) {
    const session = userSessions[userId];

    // Ensure session exists before proceeding
    if (!session) {
        console.log(`sendQuestion: No session found for user ${userId}. Quiz might have ended or been quit.`);
        // ctx.reply("Your quiz session seems to have ended. Start a new one?"); // Optional message
        return;
    }

    // --- End Quiz Condition ---
    if (session.current >= session.questions.length) {
        console.log(`Quiz finished for user ${userId}. Score: ${session.score}/${session.questions.length}`);
        // Ensure timer is cleared before ending
        if (session.timerId) {
            clearTimeout(session.timerId);
        }
        ctx.reply(`Quiz finished! Your score: ${session.score}/${session.questions.length}`);

        // Update overall progress using only the questions asked in *this* session
        const userProgress = await getUserProgress(userId);
        const updatedAskedQuestions = [...new Set([...userProgress.askedQuestions, ...session.askedQuestions])]; // Combine and deduplicate
        // Decide how to update score - maybe store highest score? Or last score? Here we store the last score.
        await updateUserProgress(userId, session.score, updatedAskedQuestions);
        delete userSessions[userId]; // Clean up session
        // Send the main menu keyboard again
         ctx.reply(
            "What would you like to do next?",
            Markup.keyboard([['Start Quiz'], ['User Progress', 'Leaderboard'], ['Quit Quiz']]).resize()
         );
        return;
    }

    // --- Send Question ---
    const question = session.questions[session.current];
    let options = [];
    try {
        const allNames = await fetchNamesOfAllah();
        options = allNames
            .filter(n => n.name !== question.name)
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);
        options.push(question);
        options = options.sort(() => 0.5 - Math.random());

        // Ensure we have valid options
        if (options.length < 2) {
             console.error(`Not enough options generated for question: ${question.name}`);
             ctx.reply("Error generating question options. Skipping this one.");
             session.current++; // Skip the faulty question
             sendQuestion(ctx, userId); // Send next
             return;
        }

    } catch (error) {
        console.error("Error fetching names for options:", error);
        ctx.reply("Error loading question options. Skipping this one.");
        session.current++; // Skip the faulty question
        sendQuestion(ctx, userId); // Send next
        return;
    }

    // Make sure the previous timer is cleared before setting a new one
    if (session.timerId) {
        clearTimeout(session.timerId);
    }

    const questionIndex = session.current; // Capture the current index for the timer callback

    // Send the question message
    const message = `*Question ${session.current + 1}/${session.questions.length}:*\n\nWhat is the meaning of *${question.name}*?`;
    await ctx.replyWithMarkdownV2( // Use MarkdownV2 for better formatting control if needed
        message.replace(/[-\.!]/g, '\\$&'), // Escape markdown characters in name if using V2
        Markup.inlineKeyboard(
            options.map((opt) => [
                // Use JSON stringify for callback data to handle complex scenarios if needed, but simple string is fine here
                Markup.button.callback(opt.meaning, `answer_${userId}_${opt.name === question.name}_${questionIndex}`)
            ])
        )
    );

    // --- Start Timer ---
    console.log(`Setting ${QUESTION_TIMEOUT/1000}s timer for user ${userId}, question index ${questionIndex}`);
    session.timerId = setTimeout(async () => {
        console.log(`Timer expired for user ${userId}, question index ${questionIndex}`);
        const currentSession = userSessions[userId]; // Re-fetch session state

        // Check if the session still exists AND if the question index hasn't changed
        // This prevents the timer acting on an already answered/skipped question
        if (currentSession && currentSession.current === questionIndex) {
            console.log(`User ${userId} timed out on question ${questionIndex}. Moving to next.`);
            await ctx.reply("⏰ Time's up!"); // Use await
            currentSession.current++; // Move to the next question index
            // No score added for timeout
            await sendQuestion(ctx, userId); // Send the next question (or end quiz)
        } else {
             console.log(`Timer for user ${userId}, question ${questionIndex} ignored (quiz state changed). Current index: ${currentSession?.current}`);
        }
    }, QUESTION_TIMEOUT); // Use the constant
}


// Modified Action Handler
bot.action(/answer_(\d+)_(true|false)_(\d+)/, async (ctx) => {
    // Extract data
    const userId = parseInt(ctx.match[1]);
    const isCorrect = ctx.match[2] === 'true';
    const questionIndex = parseInt(ctx.match[3]); // Index of the question this answer is for

    const session = userSessions[userId];

    // 1. Check if session exists
    if (!session) {
        console.log(`Action received for user ${userId}, but no active session found.`);
        await ctx.answerCbQuery("Your quiz session seems to have ended."); // Inform user via callback query
        // Optionally try removing the inline keyboard from the old message
        try { await ctx.editMessageReplyMarkup(undefined); } catch (e) { /* Ignore errors if message is old */ }
        return;
    }

    // 2. Check if this answer is for the CURRENT question
    if (session.current !== questionIndex) {
        console.log(`Action received for user ${userId}, question ${questionIndex}, but current question is ${session.current}. Ignoring.`);
        await ctx.answerCbQuery("This answer is for a previous question.");
         // Optionally try removing the inline keyboard from the old message
        try { await ctx.editMessageReplyMarkup(undefined); } catch (e) { /* Ignore errors if message is old */ }
        return;
    }

    // 3. Clear the timer for the current question
    console.log(`Answer received for user ${userId}, question ${questionIndex}. Clearing timer ID: ${session.timerId}`);
    if (session.timerId) {
        clearTimeout(session.timerId);
        session.timerId = null; // Reset timerId in session
    }

    // 4. Process the answer
    if (isCorrect) {
        session.score++;
        await ctx.reply("✅ Correct!"); // Use await
    } else {
        // Provide the correct answer if wrong
        const correctAnswer = session.questions[session.current];
        await ctx.reply(`❌ Wrong! The correct meaning of *${correctAnswer.name}* is *${correctAnswer.meaning}*`); // Use await
    }

    // 5. Move to the next question
    session.current++;

    // 6. Remove the inline keyboard from the answered question
    try {
        await ctx.editMessageReplyMarkup(undefined); // Remove keyboard by passing undefined
    } catch(error) {
        console.warn(`Could not edit message reply markup for user ${userId}: ${error.message}`);
        // Ignore if editing fails (e.g., message too old)
    }


    // 7. Send the next question or end the quiz
    await sendQuestion(ctx, userId); // Use await
});


bot.hears('Quit Quiz', (ctx) => {
    const userId = ctx.from.id;
    const session = userSessions[userId];
    if (session) {
        // Clear any active timer before deleting the session
        if (session.timerId) {
            clearTimeout(session.timerId);
            console.log(`Quiz quit by user ${userId}. Cleared timer ID: ${session.timerId}`);
        }
        delete userSessions[userId];
        ctx.reply("Quiz stopped. See you next time!", Markup.keyboard([['Start Quiz'], ['User Progress', 'Leaderboard']]).resize());
    } else {
        ctx.reply("No active quiz to quit.", Markup.keyboard([['Start Quiz'], ['User Progress', 'Leaderboard']]).resize());
    }
});

bot.hears('User Progress', async (ctx) => {
    const userId = ctx.from.id;
    try {
        const progress = await getUserProgress(userId);
        // Display score and maybe number of unique questions answered
        const answeredCount = progress.askedQuestions?.length || 0;
        ctx.reply(`Your last recorded score: ${progress.score}\nUnique questions encountered: ${answeredCount}`);
    } catch (error) {
        console.error(`Error fetching progress for user ${userId}:`, error);
        ctx.reply("Sorry, couldn't fetch your progress.");
    }
});

bot.hears('Leaderboard', async (ctx) => {
    try {
        const leaderboardSnap = await getDocs(collection(db, "user_progress"));
        let leaderboardPromises = leaderboardSnap.docs.map(async (docSnap) => {
            const data = docSnap.data();
            const userId = docSnap.id;
            const username = await getUsername(userId); // Fetch username
             // Ensure score is a number, default to 0 if missing/invalid
            const score = typeof data.score === 'number' ? data.score : 0;
            return { username, score }; // Use fetched or default username
        });

        let leaderboard = await Promise.all(leaderboardPromises);

        leaderboard = leaderboard
                        .filter(entry => entry.username) // Ensure username exists
                        .sort((a, b) => b.score - a.score); // Sort by score descending

        if (leaderboard.length === 0) {
            ctx.reply("🏆 Leaderboard 🏆\n\nNo scores recorded yet!");
            return;
        }

        const message = "🏆 Leaderboard 🏆\n\n" +
            leaderboard.slice(0, 10) // Show top 10
            .map((entry, i) => {
                 // Handle usernames that might not start with @ or are default
                 const displayUsername = entry.username.startsWith('User') ? entry.username : `@${entry.username}`;
                 return `${i + 1}. ${displayUsername}: ${entry.score} points`;
             })
            .join('\n');
        ctx.reply(message);
    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        ctx.reply("Sorry, couldn't fetch the leaderboard.");
    }
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Launch Bot Polling
bot.launch().then(() => {
    console.log('Telegram bot started polling...');
}).catch(err => {
    console.error('Failed to launch bot:', err);
});


// Express Server for Render Keep-Alive (remains the same)
app.get('/', (req, res) => res.send('Asmaul Husna Quiz Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));