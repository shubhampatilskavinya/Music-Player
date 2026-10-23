export type Song = {
  id: number;
  title: string;
  artist: string;
  movie: string;
  duration: string;
  durationLabel?: string;
  external?: boolean;
  gradient: string;
  youtubeId: string;
  requestedBy?: { id: string; name: string };
};

const gradients = [
  "from-rose-500 to-orange-400",
  "from-fuchsia-500 to-indigo-500",
  "from-amber-400 to-pink-500",
  "from-emerald-400 to-cyan-500",
  "from-violet-500 to-purple-400",
  "from-sky-400 to-blue-600",
  "from-red-500 to-amber-400",
  "from-pink-500 to-rose-400",
];

// Historical clip labels are retained as catalog metadata only.
// Playback uses the complete duration reported by YouTube.
const catalog: Array<[string, string, string, string, string, string?]> = [
  ["Aaj Ki Raat", "Madhubanti Bagchi, Divya Kumar", "Stree 2", "1:30", "feGID1WiC1Q"],
  ["Aayi Nai", "Pawan Singh, Simran Choudhary, Divya Kumar", "Stree 2", "1:15", "UXW_e7j1iQA"],
  ["Tauba Tauba", "Karan Aujla", "Bad Newz", "1:15", "FIxqC13yiEQ"],
  ["Bijuria", "Sonu Nigam, Asees Kaur", "Sunny Sanskari Ki Tulsi Kumari", "1:30", "aPn-P_3bQxA"],
  ["Panwadi", "A.P.S, Khesari Lal Yadav, Masoom Sharma", "Sunny Sanskari Ki Tulsi Kumari", "1:30", "0e5LsgYRL18"],
  ["Laal Pari", "Yo Yo Honey Singh", "Housefull 5", "1:15", "y334ZHmAorw"],
  ["Ucha Lamba Kad Forever", "Anand Raj Anand", "Welcome to the Jungle", "1:15", "o7e8I4-z180"],
  ["Dhurandhar – Title Track", "Shashwat Sachdev", "Dhurandhar", "1:15", "PL_dIbe34pU"],
  ["Lutt Le Gaya", "Shashwat Sachdev, Simran Choudhary", "Dhurandhar", "1:15", "AL_fMjB8IDc"],
  ["Naal Nachna", "Shashwat Sachdev, Afsana Khan, Reble", "Dhurandhar", "1:15", "PtVXmMaHtTI"],
  ["Ramba Ho", "Shashwat Sachdev, Madhubanti Bagchi", "Dhurandhar", "1:15", "kg_BD5DXP3w"],
  ["Shararat ⭐", "Shashwat Sachdev, Madhubanti Bagchi", "Dhurandhar", "2:30", "YnsomC07Y9M", "2:00–2:30"],
  ["Aari Aari – Dhurandhar The Revenge", "Shashwat Sachdev, Bombay Rockers", "Dhurandhar The Revenge", "1:30", "l3Vlb0hF5FU"],
  ["Bandhu 2.0 – Cocktail 2", "Pritam, Kavita Seth", "Cocktail 2", "1:30", "K-TtdoGAgBQ"],
  ["Mashooqa – Cocktail 2", "Pritam", "Cocktail 2", "1:30", "iLZrYaHVnEQ"],
  ["What Jhumka?", "Arijit Singh, Jonita Gandhi", "Rocky Aur Rani Kii Prem Kahaani", "1:15", "OTDkmeG9_LI"],
  ["Kala Chashma", "Amar Arshi, Badshah, Neha Kakkar", "Baar Baar Dekho", "1:15", "-1d0XfIwV6U"],
  ["Badtameez Dil", "Benny Dayal, Shefali Alvares", "Yeh Jawaani Hai Deewani", "1:15", "XhPfLwzpF5Y"],
  ["Chikni Chameli", "Shreya Ghoshal", "Agneepath", "1:15", "Wqy7vyVvyFQ"],
  ["O Saki Saki", "Neha Kakkar, Tulsi Kumar, B Praak", "Batla House", "1:15", "HoWtADNG_wQ"],
  ["Balam Pichkari", "Vishal Dadlani, Shalmali Kholgade", "Yeh Jawaani Hai Deewani", "1:30", "hn7TItT9g44"],
  ["Tamma Tamma Again", "Bappi Lahiri, Anuradha Paudwal, Badshah", "Badrinath Ki Dulhania", "1:15", "VRWS1vkxgkA"],
  ["Raat Baaki – remix", "DJ Hardik", "Remix", "1:30", "lEgjHT3yJcY"],
  ["Jhum Jhum Baba – remix", "D'VESH", "Remix", "1:30", "kmDaSqOh99I"],
  ["Shararat reprise", "Shashwat Sachdev, Madhubanti Bagchi", "Dhurandhar", "0:45", "YnsomC07Y9M"],
  ["Ghungroo", "DJ NYK remix", "War", "3:30", "-NN1SZObdGA"],
  ["Jhoome Jo Pathaan", "DJ Mitra remix", "Pathaan", "3:30", "6jxCi8ZpuBQ"],
  ["Besharam Rang", "DJ Sree remix", "Pathaan", "3:30", "CbPO8DtNzwY"],
  ["Zinda Banda", "DJ Piyush Bajaj remix", "Jawan", "3:30", "04neO4EAuuE"],
  ["Not Ramaiya Vastavaiya", "VDJ Nirob remix", "Jawan", "3:30", "Ar-j20_p69s"],
  ["Sher Khul Gaye", "DJ Kawal & DJ Star remix", "Fighter", "3:30", "iqDT6lTQlyQ"],
  ["Akhiyaan Gulaab", "DJ Basque remix", "Teri Baaton Mein Aisa Uljha Jiya", "3:30", "qsOInR6wpIA"],
  ["Naina", "DJ NYK remix", "Crew", "3:30", "xJ6HNZStCBc"],
  ["Teri Baaton Mein Aisa Uljha Jiya", "DJ Basque remix", "Teri Baaton Mein Aisa Uljha Jiya", "3:30", "jyTfmYVR3Sw"],
  ["Taras", "DJ Notorious remix", "Munjya", "3:30", "I3N84NZuqRs"],
  ["Sajna Ve Sajna", "DJ Lijo flip", "Vicky Vidya Ka Woh Wala Video", "3:30", "0jwO-6ap2Wc"],
  ["Uyi Amma", "DJ Aqeel dance mix", "Azaad", "3:30", "bR6lLzV3yxY"],
  ["Bhasad Macha", "DJ ALxx & VDJ Abhishek remix", "Deva", "3:30", "iHw8uR1ZkFY"],
  ["Saturday Saturday", "Party remix", "Humpty Sharma Ki Dulhania", "3:30", "8L8T0wmQbGw"],
  ["Kar Gayi Chull", "DJ Chetas remix", "Kapoor & Sons", "3:30", "BV0Dn93uc6g"],
  ["London Thumakda", "DJ Rizwan remix", "Queen", "3:30", "cw6IzrJAh_I"],
  ["Gallan Goodiyaan", "DJ Kaash remix", "Dil Dhadakne Do", "3:30", "AMPRsQi06bM"],
  ["Morni Banke", "DJ Nafizz & DJ Avi remix", "Badhaai Ho", "3:30", "GThjX65PDCU"],
  ["Sweety Tera Drama", "DJ Notorious remix", "Bareilly Ki Barfi", "3:30", "fR43t3LaJlU"],
  ["Aankh Marey", "DJ Shadow Dubai remix", "Simmba", "3:30", "Whz9Tni_ctA"],
  ["Coca Cola", "DJ Dharak remix", "Luka Chuppi", "3:30", "yO5H0kREShA"],
  ["Bom Diggy Diggy", "DJ Chetas remix", "Sonu Ke Titu Ki Sweety", "3:30", "YdYN58zA_NI"],
  ["Dil Chori", "DJ Abhishek & DJ Star remix", "Sonu Ke Titu Ki Sweety", "3:30", "hLa_KdZ-oBc"],
  ["Nashe Si Chadh Gayi", "Aqeel Ali remix", "Befikre", "3:30", "oenn4xWHr8U"],
  ["Swag Se Swagat", "DJ Paroma edit", "Tiger Zinda Hai", "3:30", "6vuPVUqg9LY"],
  ["High Heels Te Nachche", "DJ Chetas remix", "Ki & Ka", "3:30", "a-i9V_7v18s"],
  ["Proper Patola", "DJ Chico & DJ Ravish club mix", "Namaste England", "3:30", "1fTSIpdm-rw"],
  ["Desi Girl", "DJ Amit Saxena remix", "Dostana", "3:30", "09l1Pcx3jpg"],
  ["Kajra Re", "Remix", "Bunty Aur Babli", "3:30", "sE0YZF0Lh8U"],
  ["Dhoom Machale", "DJ Abdul & DJ Ganesh remix", "Dhoom", "3:30", "0HPtq8Y-0cE"],
  ["It's The Time To Disco", "DJ RD remix", "Kal Ho Naa Ho", "3:30", "LHtByCm6ZJk"],
  ["Party On My Mind", "Remix", "Race 2", "3:30", "sGhoc5y-UIM"],
  ["Lat Lag Gayee", "DJ Abhishek & DJ Vinisha remix", "Race 2", "3:30", "9TM7eeNFw9E"],
  ["Ghagra", "DJ Chetas remix", "Yeh Jawaani Hai Deewani", "3:30", "WNr8s9jXlAU"],
  ["Dilliwalli Girlfriend", "DJ Chetas & DJ NYK remix", "Yeh Jawaani Hai Deewani", "3:30", "rUAqGxTb_is"],
  ["Chammak Challo", "DJ O2 & SRK remix", "Ra.One", "3:30", "KfhIFDgG--8"],
  ["Criminal", "Remix", "Ra.One", "3:30", "XLDEZwx9jDM"],
  ["Nagada Nagada", "Deejay K & DJ Shad remix", "Jab We Met", "3:30", "qxE-lKbZmRE"],
  ["Mauja Hi Mauja", "DJ Harsh Bhutani remix", "Jab We Met", "3:30", "iHFC-4RHTKo"],
  ["Laung Da Lashkara", "Remix", "Patiala House", "3:30", "iOSSDXxISqQ"],
  ["Garmi", "DJ Shadow Dubai remix", "Street Dancer 3D", "3:30", "_bT3FsN-zwA"],
  ["Muqabla", "DJ SherGill remix", "Street Dancer 3D", "2:15", "lTv3-SwgUAw"],
];

export const songs: Song[] = catalog.map(([title, artist, movie, duration, youtubeId, durationLabel], i) => ({
  id: i + 1,
  title,
  artist,
  movie,
  duration,
  durationLabel,
  gradient: gradients[i % gradients.length],
  youtubeId,
}));
