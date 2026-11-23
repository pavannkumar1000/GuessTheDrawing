// utils/words.js
export const WORDS = [
  "apple", "house", "car", "tree", "dog", "cat", "sun", "moon", "star", "cloud",
  "boat", "fish", "bird", "chair", "table", "bed", "door", "window", "cup", "spoon",
  "fork", "knife", "plate", "bowl", "hat", "shoe", "sock", "shirt", "pants", "dress",
  "glasses", "watch", "ring", "bag", "book", "pen", "pencil", "paper", "phone", "computer",
  "tv", "radio", "camera", "clock", "key", "lock", "lamp", "fan", "bottle", "ball",
  "bat", "kite", "balloon", "guitar", "drum", "piano", "violin", "microphone", "headphone", "speaker",
  "bread", "cheese", "egg", "milk", "water", "juice", "coffee", "tea", "ice cream", "cake",
  "pizza", "burger", "fries", "hotdog", "sandwich", "cookie", "candy", "chocolate", "popcorn", "banana",
  "orange", "grapes", "strawberry", "watermelon", "pineapple", "carrot", "potato", "tomato", "onion", "corn",
  "flower", "grass", "leaf", "mountain", "river", "beach", "island", "bridge", "road", "train"
];

export const getRandomWord = () => {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
};