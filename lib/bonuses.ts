import { brand, pricing } from '@/lib/config';

// Workshop bonuses — shown on the landing pages (/, /hi, /mar: bonus cards +
// recap) and in the checkout order summary (English). Edit copy/values here
// and every surface updates. Cover art (English on every page):
// public/Images Sourabh/bonus-<n>.webp.

export type Lang = 'en' | 'hi' | 'mar';

export interface Bonus {
  n: number;
  value: number;
  title: Record<Lang, string>;
  copy: Record<Lang, string>;
}

export const BONUSES: Bonus[] = [
  {
    n: 1,
    value: 997,
    title: {
      en: 'The Complete Spine Strengthening Guide',
      hi: 'Spine को मज़बूत बनाने की Complete Guide',
      mar: 'मणका मजबूत करण्याची Complete Guide',
    },
    copy: {
      en: 'The exact exercises to build a stronger, more resilient backbone, so your spine stops being the thing you have to protect and starts being the thing that supports everything else you do.',
      hi: 'एक मज़बूत और resilient backbone बनाने के exact exercises, ताकि आपकी spine वो चीज़ न रहे जिसे आपको हर समय बचाना पड़े, बल्कि वो बने जो आपके हर काम को support करे।',
      mar: 'मजबूत आणि resilient पाठीचा कणा तयार करण्यासाठी exact exercises, जेणेकरून तुमचा मणका सतत जपावा लागणारा भाग न राहता, तुमच्या प्रत्येक कामाला आधार देणारा बनेल.',
    },
  },
  {
    n: 2,
    value: 997,
    title: {
      en: 'The Complete Knee Care & Exercise Guide',
      hi: 'Knee Care और Exercise की Complete Guide',
      mar: 'गुडघ्यांची काळजी आणि Exercise ची Complete Guide',
    },
    copy: {
      en: 'A full exercise system for knees that ache going up stairs or after a long day on your feet, built around strengthening what supports the joint, not just stretching around the pain.',
      hi: 'सीढ़ियाँ चढ़ते समय या दिन भर खड़े रहने के बाद दर्द करने वाले घुटनों के लिए पूरा exercise system, जो सिर्फ दर्द के आस-पास stretching पर नहीं, बल्कि joint को support करने वाली muscles को मज़बूत बनाने पर आधारित है।',
      mar: 'जिने चढताना किंवा दिवसभर उभे राहिल्यानंतर दुखणाऱ्या गुडघ्यांसाठी संपूर्ण exercise system, जे फक्त दुखण्याभोवती stretching करण्यावर नाही, तर joint ला आधार देणाऱ्या स्नायूंना मजबूत करण्यावर आधारित आहे.',
    },
  },
  {
    n: 3,
    value: 497,
    title: {
      en: 'Lifting Techniques & Back Strain Prevention',
      hi: 'सही तरीके से वज़न उठाना और Back Strain से बचाव',
      mar: 'योग्य पद्धतीने वजन उचलणे आणि Back Strain पासून बचाव',
    },
    copy: {
      en: 'How to lift, bend and carry without the twinge, for the moments that actually cause most back injuries: picking up a bag, a child, a box, not the gym.',
      hi: 'बिना झटका लगे वज़न उठाना, झुकना और सामान उठाकर चलना, उन पलों के लिए जो असल में ज़्यादातर back injuries की वजह बनते हैं: बैग, बच्चा या डिब्बा उठाना, gym नहीं।',
      mar: 'झटका न बसता वजन उचलणे, वाकणे आणि सामान वाहून नेणे, त्या क्षणांसाठी जे खरंतर बहुतेक back injuries चे कारण ठरतात: पिशवी, मूल किंवा खोका उचलणे, gym नाही.',
    },
  },
  {
    n: 4,
    value: 497,
    title: {
      en: 'Back to Basics, Everyday Spine Care Habits',
      hi: 'Back to Basics: रोज़ की Spine Care Habits',
      mar: 'Back to Basics: रोजच्या Spine Care सवयी',
    },
    copy: {
      en: 'The small daily habits, how you sit, sleep and stand, that either protect your spine or quietly work against it long before pain shows up.',
      hi: 'छोटी-छोटी daily habits, आप कैसे बैठते, सोते और खड़े होते हैं, जो या तो आपकी spine को बचाती हैं या दर्द शुरू होने से बहुत पहले चुपचाप उसके खिलाफ काम करती हैं।',
      mar: 'छोट्या-छोट्या daily सवयी, तुम्ही कसे बसता, झोपता आणि उभे राहता, ज्या एकतर तुमच्या मणक्याचे रक्षण करतात किंवा वेदना सुरू होण्याच्या खूप आधीपासून शांतपणे त्याच्या विरोधात काम करतात.',
    },
  },
  {
    n: 5,
    value: 497,
    title: {
      en: 'Lifestyle Tips for Lasting Knee Health',
      hi: 'घुटनों की लंबी सेहत के लिए Lifestyle Tips',
      mar: 'गुडघ्यांच्या दीर्घकाळ आरोग्यासाठी Lifestyle Tips',
    },
    copy: {
      en: 'The everyday adjustments, footwear, posture, movement habits, that keep your knees supported between workshop sessions and long after the two days are over.',
      hi: 'रोज़मर्रा के छोटे बदलाव, footwear, posture और movement habits, जो workshop sessions के बीच और दो दिन खत्म होने के बाद भी लंबे समय तक आपके घुटनों को support करते रहें।',
      mar: 'रोजच्या जीवनातील छोटे बदल, footwear, posture आणि movement सवयी, ज्या workshop sessions दरम्यान आणि दोन दिवस संपल्यानंतरही दीर्घकाळ तुमच्या गुडघ्यांना आधार देत राहतात.',
    },
  },
];

export const bonusesTotalInr = BONUSES.reduce((sum, b) => sum + b.value, 0);

export const inr = (n: number) => n.toLocaleString('en-IN');

// Offer math for the landing value blocks. The workshop counts at its list
// price (ORIGINAL_PRICE_INR); the buyer pays PRICE_INR for everything.
export const offer = (() => {
  const workshopValue = pricing.client.originalInr;
  const totalValue = workshopValue + bonusesTotalInr;
  const price = pricing.client.inr;
  const savings = pricing.client.originalInr - price;
  const percentOff = Math.round((savings / pricing.client.originalInr) * 100);
  return { workshopValue, totalValue, price, savings, percentOff };
})();

// UI strings for the bonus section + recap, per landing-page language.
export const BONUS_UI: Record<Lang, {
  kicker: string;
  heading: string;
  headingGreen: string;
  included: string;
  value: (v: string) => string;
  totalBonusValue: string;
  getEverything: string;
  save: (amount: string, pct: number) => string;
  recapTitle: string;
  recapTitleGreen: string;
  thIncluded: string;
  thValue: string;
  totalValue: string;
  oneTime: string;
  workshopRow: string;
  bonusLabel: (n: number) => string;
}> = {
  en: {
    kicker: 'Bonuses Included',
    heading: '5 Exclusive Bonus Guides to',
    headingGreen: 'Keep You Pain-Free',
    included: 'Bonus Included',
    value: v => `(₹${v} Value)`,
    totalBonusValue: 'Total Bonus Value',
    getEverything: 'Get everything today for',
    save: (a, p) => `You save ₹${a} (${p}% off)`,
    recapTitle: 'Recap of Everything',
    recapTitleGreen: 'You’ll Get',
    thIncluded: 'Included',
    thValue: 'Value',
    totalValue: 'Total Value',
    oneTime: 'One-time payment',
    workshopRow: `${brand.productName} (2-Day Live)`,
    bonusLabel: n => `Bonus ${n}`,
  },
  hi: {
    kicker: 'Bonus शामिल हैं',
    heading: '5 Exclusive Bonus Guides, जो आपको रखें',
    headingGreen: 'Pain-Free',
    included: 'Bonus शामिल',
    value: v => `(₹${v} मूल्य)`,
    totalBonusValue: 'कुल Bonus मूल्य',
    getEverything: 'आज ही सब कुछ पाएं सिर्फ',
    save: (a, p) => `आपकी बचत ₹${a} (${p}% off)`,
    recapTitle: 'आपको मिलने वाली',
    recapTitleGreen: 'हर चीज़ का Recap',
    thIncluded: 'शामिल',
    thValue: 'मूल्य',
    totalValue: 'कुल मूल्य',
    oneTime: 'एक बार का Payment',
    workshopRow: `${brand.productName} (2-दिन Live)`,
    bonusLabel: n => `Bonus ${n}`,
  },
  mar: {
    kicker: 'Bonus समाविष्ट',
    heading: '5 Exclusive Bonus Guides, जे तुम्हाला ठेवतील',
    headingGreen: 'Pain-Free',
    included: 'Bonus समाविष्ट',
    value: v => `(₹${v} मूल्य)`,
    totalBonusValue: 'एकूण Bonus मूल्य',
    getEverything: 'आजच सर्व काही मिळवा फक्त',
    save: (a, p) => `तुमची बचत ₹${a} (${p}% off)`,
    recapTitle: 'तुम्हाला मिळणाऱ्या',
    recapTitleGreen: 'सर्व गोष्टींचा Recap',
    thIncluded: 'समाविष्ट',
    thValue: 'मूल्य',
    totalValue: 'एकूण मूल्य',
    oneTime: 'एकदाच Payment',
    workshopRow: `${brand.productName} (2-दिवसीय Live)`,
    bonusLabel: n => `Bonus ${n}`,
  },
};
