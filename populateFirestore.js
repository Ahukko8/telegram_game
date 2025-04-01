import { initializeApp } from "firebase/app";
import { getFirestore, collection, setDoc, doc } from "firebase/firestore";
import dotenv from "dotenv";

dotenv.config();

// ✅ Firebase Configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ✅ List of 99 Names of Allah
const namesOfAllah = [
  { name: "Ar-Rahman (ٱلرَّحْمَٰنُ)", meaning: "The Beneficent" },
  { name: "Ar-Rahim (ٱلرَّحِيمُ)", meaning: "The Merciful" },
  { name: "Al-Malik (ٱلْمَلِكُ)", meaning: "The King and Owner of Dominion" },
  { name: "Al-Quddus (ٱلْقُدُّوسُ)", meaning: "The Absolutely Pure" },
  { name: "As-Salam (ٱلْسَّلَامُ)", meaning: "The Source of Peace and Safety" },
  { name: "Al-Mu’min (ٱلْمُؤْمِنُ)", meaning: "The Giver of Faith and Security" },
  { name: "Al-Muhaymin (ٱلْمُهَيْمِنُ)", meaning: "The Guardian, The Witness, The Overseer" },
  { name: "Al-Aziz (ٱلْعَزِيزُ)", meaning: "The Almighty" },
  { name: "Al-Jabbar (ٱلْجَبَّارُ)", meaning: "The Compeller, The Restorer" },
  { name: "Al-Mutakabbir (ٱلْمُتَكَبِّرُ)", meaning: "The Supreme, The Majestic" },
  { name: "Al-Khaliq (ٱلْخَالِقُ)", meaning: "The Creator, The Maker" },
  { name: "Al-Bari’ (ٱلْبَارِئُ)", meaning: "The Evolver" },
  { name: "Al-Musawwir (ٱلْمُصَوِّرُ)", meaning: "The Fashioner" },
  { name: "Al-Ghaffar (ٱلْغَفَّارُ)", meaning: "The Constant Forgiver" },
  { name: "Al-Qahhar (ٱلْقَهَّارُ)", meaning: "The All-Prevailing One" },
  { name: "Al-Wahhab (ٱلْوَهَّابُ)", meaning: "The Supreme Bestower" },
  { name: "Ar-Razzaq (ٱلرَّزَّاقُ)", meaning: "The Provider" },
  { name: "Al-Fattah (ٱلْفَتَّاحُ)", meaning: "The Supreme Solver" },
  { name: "Al-Alim (ٱلْعَلِيمُ)", meaning: "The All-Knowing" },
  { name: "Al-Qabid (ٱلْقَابِضُ)", meaning: "The Withholder" },
  { name: "Al-Basit (ٱلْبَاسِطُ)", meaning: "The Extender" },
  { name: "Al-Khafid (ٱلْخَافِضُ)", meaning: "The Reducer" },
  { name: "Ar-Rafi‘ (ٱلرَّافِعُ)", meaning: "The Exalter" },
  { name: "Al-Mu‘izz (ٱلْمُعِزُّ)", meaning: "The Honourer-Bestower" },
  { name: "Al-Mudhill (ٱلْمُذِلُّ)", meaning: "The Dishonourer" },
  { name: "As-Sami‘ (ٱلْسَّمِيعُ)", meaning: "The All-Hearing" },
  { name: "Al-Basir (ٱلْبَصِيرُ)", meaning: "The All-Seeing" },
  { name: "Al-Hakam (ٱلْحَكَمُ)", meaning: "The Impartial Judge" },
  { name: "Al-Adl (ٱلْعَدْلُ)", meaning: "The Embodiment of Justice" },
  { name: "Al-Latif (ٱلْلَّطِيفُ)", meaning: "The Subtle One" },
  { name: "Al-Khabir (ٱلْخَبِيرُ)", meaning: "The All-Aware" },
  { name: "Al-Halim (ٱلْحَلِيمُ)", meaning: "The Most Forbearing" },
  { name: "Al-Azim (ٱلْعَظِيمُ)", meaning: "The Magnificent" },
  { name: "Al-Ghaffur (ٱلْغَفُورُ)", meaning: "The Great Forgiver" },
  { name: "Ash-Shakur (ٱلشَّكُورُ)", meaning: "The Most Appreciative" },
  { name: "Al-Aliyy (ٱلْعَلِيُّ)", meaning: "The Most High, The Exalted" },
  { name: "Al-Kabir (ٱلْكَبِيرُ)", meaning: "The Most Great" },
  { name: "Al-Hafiz (ٱلْحَفِيظُ)", meaning: "The Preserver" },
  { name: "Al-Muqit (ٱلْمُقِيتُ)", meaning: "The Sustainer" },
  { name: "Al-Hasib (ٱلْحَسِيبُ)", meaning: "The Reckoner" },
  { name: "Al-Jalil (ٱلْجَلِيلُ)", meaning: "The Majestic" },
  { name: "Al-Karim (ٱلْكَرِيمُ)", meaning: "The Most Generous, The Most Esteemed" },
  { name: "Ar-Raqib (ٱلْرَّقِيبُ)", meaning: "The Watchful" },
  { name: "Al-Mujib (ٱلْمُجِيبُ)", meaning: "The Responsive One" },
  { name: "Al-Wasi‘ (ٱلْوَاسِعُ)", meaning: "The All-Encompassing, the Boundless" },
  { name: "Al-Hakim (ٱلْحَكِيمُ)", meaning: "The All-Wise" },
  { name: "Al-Wadud (ٱلْوَدُودُ)", meaning: "The Most Loving" },
  { name: "Al-Majid (ٱلْمَجِيدُ)", meaning: "The Glorious, The Most Honorable" },
  { name: "Al-Ba‘ith (ٱلْبَاعِثُ)", meaning: "The Infuser of New Life" },
  { name: "Ash-Shahid (ٱلشَّهِيدُ)", meaning: "The All-and-Ever Witnessing" },
  { name: "Al-Haqq (ٱلْحَقُّ)", meaning: "The Absolute Truth" },
  { name: "Al-Wakil (ٱلْوَكِيلُ)", meaning: "The Trustee" },
  { name: "Al-Qawiyy (ٱلْقَوِيُّ)", meaning: "The All-Strong" },
  { name: "Al-Matin (ٱلْمَتِينُ)", meaning: "The Firm One" },
  { name: "Al-Waliyy (ٱلْوَلِيُّ)", meaning: "The Solely Loyal" },
  { name: "Al-Hamid (ٱلْحَمِيدُ)", meaning: "The Most Praiseworthy" },
  { name: "Al-Muhsi (ٱلْمُحْصِيُ)", meaning: "The All-Enumerating, The Counter" },
  { name: "Al-Mubdi (ٱلْمُبْدِئُ)", meaning: "The Originator, The Initiator" },
  { name: "Al-Mu'id (ٱلْمُعِيدُ)", meaning: "The Restorer, The Reinstater" },
  { name: "Al-Muhyi (ٱلْمُحْيِي)", meaning: "The Giver of Life" },
  { name: "Al-Mumit (ٱلْمُمِيتُ)", meaning: "The Creator of Death" },
  { name: "Al-Hayy (ٱلْحَيُّ)", meaning: "The Ever-Living" }
];



async function populateDatabase() {
  try {
    for (const name of namesOfAllah) {
      await setDoc(doc(collection(db, "namesOfAllah"), name.name), name);
    }
    console.log("✅ 99 Names of Allah added to Firestore!");
  } catch (error) {
    console.error("⚠️ Error adding names to Firestore:", error);
  }
}

populateDatabase();
