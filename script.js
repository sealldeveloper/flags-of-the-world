// Game state
let currentIndex = 0;
let startTime = null;
let correctAnswers = 0;
let missedFlags = [];
let gameFlags = [];
let abbreviations = {};

// Timer elements
const timerElement = document.getElementById('timer');
const progressElement = document.getElementById('progress');

// Game elements
const countryInput = document.getElementById('country-input');
const currentFlag = document.getElementById('current-flag');
const prevFlag = document.getElementById('prev-flag');
const nextFlag = document.getElementById('next-flag');
const feedback = document.getElementById('feedback');

// Button elements
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const giveUpBtn = document.getElementById('give-up-btn');
const playAgainBtn = document.getElementById('play-again-btn');

// Screen elements
const gameScreen = document.getElementById('game-screen');
const resultsScreen = document.getElementById('results-screen');

const FLAGS_DATA = [
    { url: 'https://cdn.countryflags.com/thumbs/dominica/flag-800.png', country: 'Dominica' },
{ url: 'https://cdn.countryflags.com/thumbs/maldives/flag-800.png', country: 'Maldives' },
{ url: 'https://cdn.countryflags.com/thumbs/papua-new-guinea/flag-800.png', country: 'Papua New Guinea' },
{ url: 'https://cdn.countryflags.com/thumbs/slovakia/flag-800.png', country: 'Slovakia' },
{ url: 'https://cdn.countryflags.com/thumbs/solomon-islands/flag-800.png', country: 'Solomon Islands' },
{ url: 'https://cdn.countryflags.com/thumbs/panama/flag-800.png', country: 'Panama' },
{ url: 'https://cdn.countryflags.com/thumbs/south-africa/flag-800.png', country: 'South Africa' },
{ url: 'https://cdn.countryflags.com/thumbs/mexico/flag-800.png', country: 'Mexico' },
{ url: 'https://cdn.countryflags.com/thumbs/kazakhstan/flag-800.png', country: 'Kazakhstan' },
{ url: 'https://cdn.countryflags.com/thumbs/seychelles/flag-800.png', country: 'Seychelles' },
{ url: 'https://cdn.countryflags.com/thumbs/finland/flag-800.png', country: 'Finland' },
{ url: 'https://cdn.countryflags.com/thumbs/benin/flag-800.png', country: 'Benin' },
{ url: 'https://cdn.countryflags.com/thumbs/estonia/flag-800.png', country: 'Estonia' },
{ url: 'https://cdn.countryflags.com/thumbs/madagascar/flag-800.png', country: 'Madagascar' },
{ url: 'https://cdn.countryflags.com/thumbs/north-korea/flag-800.png', country: 'North Korea' },
{ url: 'https://cdn.countryflags.com/thumbs/bhutan/flag-800.png', country: 'Bhutan' },
{ url: 'https://cdn.countryflags.com/thumbs/albania/flag-800.png', country: 'Albania' },
{ url: 'https://cdn.countryflags.com/thumbs/kosovo/flag-800.png', country: 'Kosovo' },
{ url: 'https://cdn.countryflags.com/thumbs/mongolia/flag-800.png', country: 'Mongolia' },
{ url: 'https://cdn.countryflags.com/thumbs/italy/flag-800.png', country: 'Italy' },
{ url: 'https://cdn.countryflags.com/thumbs/austria/flag-800.png', country: 'Austria' },
{ url: 'https://cdn.countryflags.com/thumbs/nauru/flag-800.png', country: 'Nauru' },
{ url: 'https://cdn.countryflags.com/thumbs/singapore/flag-800.png', country: 'Singapore' },
{ url: 'https://cdn.countryflags.com/thumbs/cuba/flag-800.png', country: 'Cuba' },
{ url: 'https://cdn.countryflags.com/thumbs/equatorial-guinea/flag-800.png', country: 'Equatorial Guinea' },
{ url: 'https://cdn.countryflags.com/thumbs/bosnia-and-herzegovina/flag-800.png', country: 'Bosnia and Herzegovina' },
{ url: 'https://cdn.countryflags.com/thumbs/denmark/flag-800.png', country: 'Denmark' },
{ url: 'https://cdn.countryflags.com/thumbs/vietnam/flag-800.png', country: 'Vietnam' },
{ url: 'https://cdn.countryflags.com/thumbs/india/flag-800.png', country: 'India' },
{ url: 'https://cdn.countryflags.com/thumbs/montenegro/flag-800.png', country: 'Montenegro' },
{ url: 'https://cdn.countryflags.com/thumbs/nicaragua/flag-800.png', country: 'Nicaragua' },
{ url: 'https://cdn.countryflags.com/thumbs/suriname/flag-800.png', country: 'Suriname' },
{ url: 'https://cdn.countryflags.com/thumbs/iraq/flag-800.png', country: 'Iraq' },
{ url: 'https://cdn.countryflags.com/thumbs/indonesia/flag-800.png', country: 'Indonesia' },
{ url: 'https://cdn.countryflags.com/thumbs/kuwait/flag-800.png', country: 'Kuwait' },
{ url: 'https://cdn.countryflags.com/thumbs/mali/flag-800.png', country: 'Mali' },
{ url: 'https://cdn.countryflags.com/thumbs/georgia/flag-800.png', country: 'Georgia' },
{ url: 'https://cdn.countryflags.com/thumbs/uzbekistan/flag-800.png', country: 'Uzbekistan' },
{ url: 'https://cdn.countryflags.com/thumbs/spain/flag-800.png', country: 'Spain' },
{ url: 'https://cdn.countryflags.com/thumbs/romania/flag-800.png', country: 'Romania' },
{ url: 'https://cdn.countryflags.com/thumbs/argentina/flag-800.png', country: 'Argentina' },
{ url: 'https://cdn.countryflags.com/thumbs/norway/flag-800.png', country: 'Norway' },
{ url: 'https://cdn.countryflags.com/thumbs/kiribati/flag-800.png', country: 'Kiribati' },
{ url: 'https://cdn.countryflags.com/thumbs/colombia/flag-800.png', country: 'Colombia' },
{ url: 'https://cdn.countryflags.com/thumbs/antigua-and-barbuda/flag-800.png', country: 'Antigua and Barbuda' },
{ url: 'https://cdn.countryflags.com/thumbs/ireland/flag-800.png', country: 'Ireland' },
{ url: 'https://cdn.countryflags.com/thumbs/central-african-republic/flag-800.png', country: 'Central African Republic' },
{ url: 'https://cdn.countryflags.com/thumbs/vanuatu/flag-800.png', country: 'Vanuatu' },
{ url: 'https://cdn.countryflags.com/thumbs/bangladesh/flag-800.png', country: 'Bangladesh' },
{ url: 'https://cdn.countryflags.com/thumbs/ghana/flag-800.png', country: 'Ghana' },
{ url: 'https://cdn.countryflags.com/thumbs/senegal/flag-800.png', country: 'Senegal' },
{ url: 'https://cdn.countryflags.com/thumbs/tanzania/flag-800.png', country: 'Tanzania' },
{ url: 'https://cdn.countryflags.com/thumbs/belgium/flag-800.png', country: 'Belgium' },
{ url: 'https://cdn.countryflags.com/thumbs/hungary/flag-800.png', country: 'Hungary' },
{ url: 'https://cdn.countryflags.com/thumbs/netherlands/flag-800.png', country: 'Netherlands' },
{ url: 'https://cdn.countryflags.com/thumbs/liberia/flag-800.png', country: 'Liberia' },
{ url: 'https://cdn.countryflags.com/thumbs/latvia/flag-800.png', country: 'Latvia' },
{ url: 'https://cdn.countryflags.com/thumbs/israel/flag-800.png', country: 'Israel' },
{ url: 'https://cdn.countryflags.com/thumbs/burundi/flag-800.png', country: 'Burundi' },
{ url: 'https://cdn.countryflags.com/thumbs/saudi-arabia/flag-800.png', country: 'Saudi Arabia' },
{ url: 'https://cdn.countryflags.com/thumbs/belarus/flag-800.png', country: 'Belarus' },
{ url: 'https://cdn.countryflags.com/thumbs/lebanon/flag-800.png', country: 'Lebanon' },
{ url: 'https://cdn.countryflags.com/thumbs/ukraine/flag-800.png', country: 'Ukraine' },
{ url: 'https://cdn.countryflags.com/thumbs/burkina-faso/flag-800.png', country: 'Burkina Faso' },
{ url: 'https://cdn.countryflags.com/thumbs/united-arab-emirates/flag-800.png', country: 'United Arab Emirates' },
{ url: 'https://cdn.countryflags.com/thumbs/tuvalu/flag-800.png', country: 'Tuvalu' },
{ url: 'https://cdn.countryflags.com/thumbs/moldova/flag-800.png', country: 'Moldova' },
{ url: 'https://cdn.countryflags.com/thumbs/france/flag-800.png', country: 'France' },
{ url: 'https://cdn.countryflags.com/thumbs/mauritania/flag-800.png', country: 'Mauritania' },
{ url: 'https://cdn.countryflags.com/thumbs/costa-rica/flag-800.png', country: 'Costa Rica' },
{ url: 'https://cdn.countryflags.com/thumbs/botswana/flag-800.png', country: 'Botswana' },
{ url: 'https://cdn.countryflags.com/thumbs/malaysia/flag-800.png', country: 'Malaysia' },
{ url: 'https://cdn.countryflags.com/thumbs/namibia/flag-800.png', country: 'Namibia' },
{ url: 'https://cdn.countryflags.com/thumbs/pakistan/flag-800.png', country: 'Pakistan' },
{ url: 'https://cdn.countryflags.com/thumbs/croatia/flag-800.png', country: 'Croatia' },
{ url: 'https://cdn.countryflags.com/thumbs/egypt/flag-800.png', country: 'Egypt' },
{ url: 'https://cdn.countryflags.com/thumbs/greece/flag-800.png', country: 'Greece' },
{ url: 'https://cdn.countryflags.com/thumbs/malta/flag-800.png', country: 'Malta' },
{ url: 'https://cdn.countryflags.com/thumbs/ecuador/flag-800.png', country: 'Ecuador' },
{ url: 'https://cdn.countryflags.com/thumbs/angola/flag-800.png', country: 'Angola' },
{ url: 'https://cdn.countryflags.com/thumbs/taiwan/flag-800.png', country: 'Taiwan' },
{ url: 'https://cdn.countryflags.com/thumbs/chad/flag-800.png', country: 'Chad' },
{ url: 'https://cdn.countryflags.com/thumbs/chile/flag-800.png', country: 'Chile' },
{ url: 'https://cdn.countryflags.com/thumbs/uganda/flag-800.png', country: 'Uganda' },
{ url: 'https://cdn.countryflags.com/thumbs/laos/flag-800.png', country: 'Laos' },
{ url: 'https://cdn.countryflags.com/thumbs/guinea/flag-800.png', country: 'Guinea' },
{ url: 'https://cdn.countryflags.com/thumbs/marshall-islands/flag-800.png', country: 'Marshall Islands' },
{ url: 'https://cdn.countryflags.com/thumbs/belize/flag-800.png', country: 'Belize' },
{ url: 'https://cdn.countryflags.com/thumbs/kenya/flag-800.png', country: 'Kenya' },
{ url: 'https://cdn.countryflags.com/thumbs/andorra/flag-800.png', country: 'Andorra' },
{ url: 'https://cdn.countryflags.com/thumbs/brunei/flag-800.png', country: 'Brunei' },
{ url: 'https://cdn.countryflags.com/thumbs/togo/flag-800.png', country: 'Togo' },
{ url: 'https://cdn.countryflags.com/thumbs/qatar/flag-800.png', country: 'Qatar' },
{ url: 'https://cdn.countryflags.com/thumbs/morocco/flag-800.png', country: 'Morocco' },
{ url: 'https://cdn.countryflags.com/thumbs/uruguay/flag-800.png', country: 'Uruguay' },
{ url: 'https://cdn.countryflags.com/thumbs/samoa/flag-800.png', country: 'Samoa' },
{ url: 'https://cdn.countryflags.com/thumbs/nigeria/flag-800.png', country: 'Nigeria' },
{ url: 'https://cdn.countryflags.com/thumbs/gabon/flag-800.png', country: 'Gabon' },
{ url: 'https://cdn.countryflags.com/thumbs/thailand/flag-800.png', country: 'Thailand' },
{ url: 'https://cdn.countryflags.com/thumbs/peru/flag-800.png', country: 'Peru' },
{ url: 'https://cdn.countryflags.com/thumbs/poland/flag-800.png', country: 'Poland' },
{ url: 'https://cdn.countryflags.com/thumbs/paraguay/flag-800.png', country: 'Paraguay' },
{ url: 'https://cdn.countryflags.com/thumbs/jordan/flag-800.png', country: 'Jordan' },
{ url: 'https://cdn.countryflags.com/thumbs/guinea-bissau/flag-800.png', country: 'Guinea Bissau' },
{ url: 'https://cdn.countryflags.com/thumbs/barbados/flag-800.png', country: 'Barbados' },
{ url: 'https://cdn.countryflags.com/thumbs/saint-lucia/flag-800.png', country: 'Saint Lucia' },
{ url: 'https://cdn.countryflags.com/thumbs/myanmar/flag-800.png', country: 'Myanmar' },
{ url: 'https://cdn.countryflags.com/thumbs/zimbabwe/flag-800.png', country: 'Zimbabwe' },
{ url: 'https://cdn.countryflags.com/thumbs/grenada/flag-800.png', country: 'Grenada' },
{ url: 'https://cdn.countryflags.com/thumbs/bahrain/flag-800.png', country: 'Bahrain' },
{ url: 'https://cdn.countryflags.com/thumbs/south-korea/flag-800.png', country: 'South Korea' },
{ url: 'https://cdn.countryflags.com/thumbs/luxembourg/flag-800.png', country: 'Luxembourg' },
{ url: 'https://cdn.countryflags.com/thumbs/syria/flag-800.png', country: 'Syria' },
{ url: 'https://cdn.countryflags.com/thumbs/jamaica/flag-800.png', country: 'Jamaica' },
{ url: 'https://cdn.countryflags.com/thumbs/guyana/flag-800.png', country: 'Guyana' },
{ url: 'https://cdn.countryflags.com/thumbs/fiji/flag-800.png', country: 'Fiji' },
{ url: 'https://cdn.countryflags.com/thumbs/bahamas/flag-800.png', country: 'Bahamas' },
{ url: 'https://cdn.countryflags.com/thumbs/sudan/flag-800.png', country: 'Sudan' },
{ url: 'https://cdn.countryflags.com/thumbs/rwanda/flag-800.png', country: 'Rwanda' },
{ url: 'https://cdn.countryflags.com/thumbs/somalia/flag-800.png', country: 'Somalia' },
{ url: 'https://cdn.countryflags.com/thumbs/lesotho/flag-800.png', country: 'Lesotho' },
{ url: 'https://cdn.countryflags.com/thumbs/djibouti/flag-800.png', country: 'Djibouti' },
{ url: 'https://cdn.countryflags.com/thumbs/slovenia/flag-800.png', country: 'Slovenia' },
{ url: 'https://cdn.countryflags.com/thumbs/saint-vincent-and-the-grenadines/flag-800.png', country: 'Saint Vincent and the Grenadines' },
{ url: 'https://cdn.countryflags.com/thumbs/niger/flag-800.png', country: 'Niger' },
{ url: 'https://cdn.countryflags.com/thumbs/venezuela/flag-800.png', country: 'Venezuela' },
{ url: 'https://cdn.countryflags.com/thumbs/guatemala/flag-800.png', country: 'Guatemala' },
{ url: 'https://cdn.countryflags.com/thumbs/malawi/flag-800.png', country: 'Malawi' },
{ url: 'https://cdn.countryflags.com/thumbs/germany/flag-800.png', country: 'Germany' },
{ url: 'https://cdn.countryflags.com/thumbs/dominican-republic/flag-800.png', country: 'Dominican Republic' },
{ url: 'https://cdn.countryflags.com/thumbs/san-marino/flag-800.png', country: 'San Marino' },
{ url: 'https://cdn.countryflags.com/thumbs/el-salvador/flag-800.png', country: 'El Salvador' },
{ url: 'https://cdn.countryflags.com/thumbs/mauritius/flag-800.png', country: 'Mauritius' },
{ url: 'https://cdn.countryflags.com/thumbs/tunisia/flag-800.png', country: 'Tunisia' },
{ url: 'https://cdn.countryflags.com/thumbs/cambodia/flag-800.png', country: 'Cambodia' },
{ url: 'https://cdn.countryflags.com/thumbs/sweden/flag-800.png', country: 'Sweden' },
{ url: 'https://cdn.countryflags.com/thumbs/japan/flag-800.png', country: 'Japan' },
{ url: 'https://cdn.countryflags.com/thumbs/united-kingdom/flag-800.png', country: 'United Kingdom' },
{ url: 'https://cdn.countryflags.com/thumbs/vatican-city/flag-800.png', country: 'Vatican City' },
{ url: 'https://cdn.countryflags.com/thumbs/sri-lanka/flag-800.png', country: 'Sri Lanka' },
{ url: 'https://cdn.countryflags.com/thumbs/cyprus/flag-800.png', country: 'Cyprus' },
{ url: 'https://cdn.countryflags.com/thumbs/lithuania/flag-800.png', country: 'Lithuania' },
{ url: 'https://cdn.countryflags.com/thumbs/iran/flag-800.png', country: 'Iran' },
{ url: 'https://cdn.countryflags.com/thumbs/philippines/flag-800.png', country: 'Philippines' },
{ url: 'https://cdn.countryflags.com/thumbs/sierra-leone/flag-800.png', country: 'Sierra Leone' },
{ url: 'https://cdn.countryflags.com/thumbs/iceland/flag-800.png', country: 'Iceland' },
{ url: 'https://cdn.countryflags.com/thumbs/libya/flag-800.png', country: 'Libya' },
{ url: 'https://cdn.countryflags.com/thumbs/canada/flag-800.png', country: 'Canada' },
{ url: 'https://cdn.countryflags.com/thumbs/comoros/flag-800.png', country: 'Comoros' },
{ url: 'https://cdn.countryflags.com/thumbs/russia/flag-800.png', country: 'Russia' },
{ url: 'https://cdn.countryflags.com/thumbs/algeria/flag-800.png', country: 'Algeria' },
{ url: 'https://cdn.countryflags.com/thumbs/south-sudan/flag-800.png', country: 'South Sudan' },
{ url: 'https://cdn.countryflags.com/thumbs/mozambique/flag-800.png', country: 'Mozambique' },
{ url: 'https://cdn.countryflags.com/thumbs/armenia/flag-800.png', country: 'Armenia' },
{ url: 'https://cdn.countryflags.com/thumbs/micronesia/flag-800.png', country: 'Micronesia' },
{ url: 'https://cdn.countryflags.com/thumbs/haiti/flag-800.png', country: 'Haiti' },
{ url: 'https://cdn.countryflags.com/thumbs/honduras/flag-800.png', country: 'Honduras' },
{ url: 'https://cdn.countryflags.com/thumbs/trinidad-and-tobago/flag-800.png', country: 'Trinidad and Tobago' },
{ url: 'https://cdn.countryflags.com/thumbs/azerbaijan/flag-800.png', country: 'Azerbaijan' },
{ url: 'https://cdn.countryflags.com/thumbs/kyrgyzstan/flag-800.png', country: 'Kyrgyzstan' },
{ url: 'https://cdn.countryflags.com/thumbs/bulgaria/flag-800.png', country: 'Bulgaria' },
{ url: 'https://cdn.countryflags.com/thumbs/zambia/flag-800.png', country: 'Zambia' },
{ url: 'https://cdn.countryflags.com/thumbs/north-macedonia/flag-800.png', country: 'North Macedonia' },
{ url: 'https://cdn.countryflags.com/thumbs/switzerland/flag-800.png', country: 'Switzerland' },
{ url: 'https://cdn.countryflags.com/thumbs/oman/flag-800.png', country: 'Oman' },
{ url: 'https://cdn.countryflags.com/thumbs/nepal/flag-800.png', country: 'Nepal' },
{ url: 'https://cdn.countryflags.com/thumbs/palau/flag-800.png', country: 'Palau' },
{ url: 'https://cdn.countryflags.com/thumbs/cameroon/flag-800.png', country: 'Cameroon' },
{ url: 'https://cdn.countryflags.com/thumbs/turkmenistan/flag-800.png', country: 'Turkmenistan' },
{ url: 'https://cdn.countryflags.com/thumbs/tonga/flag-800.png', country: 'Tonga' },
{ url: 'https://cdn.countryflags.com/thumbs/new-zealand/flag-800.png', country: 'New Zealand' },
{ url: 'https://cdn.countryflags.com/thumbs/afghanistan/flag-800.png', country: 'Afghanistan' },
{ url: 'https://cdn.countryflags.com/thumbs/ethiopia/flag-800.png', country: 'Ethiopia' },
{ url: 'https://cdn.countryflags.com/thumbs/liechtenstein/flag-800.png', country: 'Liechtenstein' },
{ url: 'https://cdn.countryflags.com/thumbs/china/flag-800.png', country: 'China' },
{ url: 'https://cdn.countryflags.com/thumbs/eritrea/flag-800.png', country: 'Eritrea' },
{ url: 'https://cdn.countryflags.com/thumbs/serbia/flag-800.png', country: 'Serbia' },
{ url: 'https://cdn.countryflags.com/thumbs/australia/flag-800.png', country: 'Australia' },
{ url: 'https://cdn.countryflags.com/thumbs/tajikistan/flag-800.png', country: 'Tajikistan' },
{ url: 'https://cdn.countryflags.com/thumbs/bolivia/flag-800.png', country: 'Bolivia' },
{ url: 'https://cdn.countryflags.com/thumbs/saint-kitts-and-nevis/flag-800.png', country: 'Saint Kitts and Nevis' },
{ url: 'https://cdn.countryflags.com/thumbs/portugal/flag-800.png', country: 'Portugal' },
{ url: 'https://cdn.countryflags.com/thumbs/yemen/flag-800.png', country: 'Yemen' },
{ url: 'https://cdn.countryflags.com/thumbs/monaco/flag-800.png', country: 'Monaco' },
{ url: 'https://cdn.countryflags.com/thumbs/palestine/flag-800.png', country: 'Palestine' },
{ url: 'https://cdn.countryflags.com/thumbs/brazil/flag-800.png', country: 'Brazil' },
{ url: 'https://cdn.countryflags.com/thumbs/gambia/flag-800.png', country: 'The Gambia' },
{ url: 'https://cdn.countryflags.com/thumbs/swaziland/flag-800.png', country: 'Eswatini' },
{ url: 'https://cdn.countryflags.com/thumbs/congo-democratic-republic-of-the/flag-800.png', country: 'Democratic Republic of the Congo' },
{ url: 'https://cdn.countryflags.com/thumbs/united-states-of-america/flag-800.png', country: 'United States' },
{ url: 'https://cdn.countryflags.com/thumbs/east-timor/flag-800.png', country: 'Timor Leste' },
{ url: 'https://cdn.countryflags.com/thumbs/turkey/flag-800.png', country: 'Türkiye' },
{ url: 'https://cdn.countryflags.com/thumbs/cote-d-ivoire/flag-800.png', country: 'Côte D’ivoire' },
{ url: 'https://cdn.countryflags.com/thumbs/czech-republic/flag-800.png', country: 'Czechia' },
{ url: 'https://cdn.countryflags.com/thumbs/congo-republic-of-the/flag-800.png', country: 'Republic of the Congo' },
{ url: 'https://cdn.countryflags.com/thumbs/sao-tome-and-principe/flag-800.png', country: 'São Tomé and Príncipe' },
{ url: 'https://cdn.countryflags.com/thumbs/cape-verde/flag-800.png', country: 'Cabo Verde' },

];

// TODO: Replace this with your abbreviations data
// Format: { 'abbreviation': 'Full Country Name' }
const ABBREVIATIONS = {
    'usa': 'United States',
    'uk': 'United Kingdom',
    'car': 'Central African Republic',
    'drc': 'Democratic Republic of the Congo',
    'republic of congo': 'Republic of the Congo',
    'democratic republic of congo': 'Democratic Republic of the Congo',
    'skan': 'Saint Kitts and Nevis',
    'st kitts and nevis': 'Saint Kitts and Nevis',
    'st vincent': 'Saint Vincent and the Grenadines',
    'gambia': 'The Gambia',
    'swaziland': 'Eswatini',
    'ivory coast': 'Côte d’Ivoire',
    'east timor': 'Timor Leste',
    'czech republic': 'Czechia',
    'sao tome and principe': 'São Tomé and Príncipe',
    'cape verde': 'Cabo Verde',
    'vatican': 'Vatican City',
    'uae': 'United Arab Emirates',
    'png': 'Papua New Guinea',
    'nz': 'New Zealand',
    'st lucia': 'Saint Lucia',
    'turkey': 'Türkiye'
};

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function initializeGame() {
    gameFlags = shuffleArray(FLAGS_DATA);
    abbreviations = { ...ABBREVIATIONS };
    currentIndex = 0;
    correctAnswers = 0;
    missedFlags = [];
    startTime = null; // Don't start timer yet
    
    if (gameFlags.length === 0) {
        alert('Please add flag data to the FLAGS_DATA array in script.js');
        return;
    }
    
    updateProgress();
    updateFlagDisplay();
    
    // Focus input
    countryInput.focus();
}

function updateProgress() {
    progressElement.textContent = `${correctAnswers}/${FLAGS_DATA.length}`;
}

function updateFlagDisplay(animate = false, direction = null) {
    // Update current flag
    if (gameFlags[currentIndex]) {
        currentFlag.src = gameFlags[currentIndex].url;
        currentFlag.alt = `Flag ${currentIndex + 1}`;
        
        // Update current flag solved state
        const currentFlagItem = document.querySelector('.flag-item.current');
        if (gameFlags[currentIndex].guessed) {
            currentFlagItem.classList.add('solved');
        } else {
            currentFlagItem.classList.remove('solved');
        }
    }
    
    // Update previous flag
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : gameFlags.length - 1;
    if (gameFlags[prevIndex]) {
        prevFlag.src = gameFlags[prevIndex].url;
        prevFlag.alt = `Flag ${prevIndex + 1}`;
        
        // Update prev flag solved state and name
        const prevFlagItem = document.querySelector('.flag-item.prev');
        if (gameFlags[prevIndex].guessed) {
            prevFlagItem.classList.add('solved');
            
            // Add or update country name
            let nameElement = prevFlagItem.querySelector('.flag-name');
            if (!nameElement) {
                nameElement = document.createElement('div');
                nameElement.className = 'flag-name';
                prevFlagItem.appendChild(nameElement);
            }
            nameElement.textContent = gameFlags[prevIndex].country;
        } else {
            prevFlagItem.classList.remove('solved');
            // Remove name element if exists
            const nameElement = prevFlagItem.querySelector('.flag-name');
            if (nameElement) {
                nameElement.remove();
            }
        }
    }
    
    // Update next flag
    const nextIndex = currentIndex < gameFlags.length - 1 ? currentIndex + 1 : 0;
    if (gameFlags[nextIndex]) {
        nextFlag.src = gameFlags[nextIndex].url;
        nextFlag.alt = `Flag ${nextIndex + 1}`;
        
        // Update next flag solved state and name
        const nextFlagItem = document.querySelector('.flag-item.next');
        if (gameFlags[nextIndex].guessed) {
            nextFlagItem.classList.add('solved');
            
            // Add or update country name
            let nameElement = nextFlagItem.querySelector('.flag-name');
            if (!nameElement) {
                nameElement = document.createElement('div');
                nameElement.className = 'flag-name';
                nextFlagItem.appendChild(nameElement);
            }
            nameElement.textContent = gameFlags[nextIndex].country;
        } else {
            nextFlagItem.classList.remove('solved');
            // Remove name element if exists
            const nameElement = nextFlagItem.querySelector('.flag-name');
            if (nameElement) {
                nameElement.remove();
            }
        }
    }
    
    // Update input state based on solved status
    updateInputState();
}

function startTimer() {
    if (startTime) return; // Already started
    
    startTime = Date.now();
    
    // Flash the timer to indicate it started
    timerElement.classList.add('timer-flash');
    setTimeout(() => {
        timerElement.classList.remove('timer-flash');
    }, 600);
    
    function updateTimer() {
        if (!startTime) return;
        
        const elapsed = Date.now() - startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        requestAnimationFrame(updateTimer);
    }
    updateTimer();
}

function normalizeAnswer(answer) {
    return answer.toLowerCase().trim().replace(/[^a-z\s]/g, '');
}

function checkAnswer() {
    const userAnswer = normalizeAnswer(countryInput.value);
    const correctAnswer = normalizeAnswer(gameFlags[currentIndex].country);
    
    // Check direct match
    if (userAnswer === correctAnswer) {
        return true;
    }
    
    // Check abbreviations
    if (abbreviations[userAnswer] && normalizeAnswer(abbreviations[userAnswer]) === correctAnswer) {
        return true;
    }
    
    return false;
}

function handleCorrectAnswer() {
    correctAnswers++;
    
    // Mark flag as guessed but don't remove from array
    gameFlags[currentIndex].guessed = true;
    
    // Clear input and make it immediately accessible
    countryInput.value = '';
    countryInput.disabled = false;
    countryInput.classList.remove('solved');
    countryInput.placeholder = 'Country name...';
    
    updateProgress();
    
    // Check if game is complete (all flags guessed)
    if (gameFlags.every(flag => flag.guessed)) {
        // Show feedback briefly before ending
        feedback.textContent = `Correct! ${gameFlags[currentIndex].country}`;
        feedback.className = 'feedback correct';
        setTimeout(() => {
            endGame();
        }, 800);
        return;
    }
    
    // Navigate to next unsolved flag immediately in background
    navigateFlags('next');
    
    // Focus input immediately
    countryInput.focus();
    
    // Show feedback and animation in background (doesn't block input)
    feedback.textContent = `Correct! ${gameFlags[currentIndex - 1] ? gameFlags[currentIndex - 1].country : 'Previous flag'}`;
    feedback.className = 'feedback correct';
    
    // Clear feedback after delay
    setTimeout(() => {
        feedback.textContent = '';
        feedback.className = 'feedback';
    }, 800);
}

function handleIncorrectAnswer() {
    feedback.textContent = `Try again...`;
    feedback.className = 'feedback incorrect';
    
    setTimeout(() => {
        feedback.textContent = '';
        feedback.className = 'feedback';
    }, 1000);
}



function updateInputState() {
    if (gameFlags[currentIndex] && gameFlags[currentIndex].guessed) {
        countryInput.disabled = true;
        countryInput.value = gameFlags[currentIndex].country;
        countryInput.classList.add('solved');
        countryInput.placeholder = '✓ Solved';
    } else {
        countryInput.disabled = false;
        countryInput.value = '';
        countryInput.classList.remove('solved');
        countryInput.placeholder = 'Country name...';
    }
}

function findNextUnsolvedFlag(direction) {
    let nextIndex = currentIndex;
    let attempts = 0;
    const maxAttempts = gameFlags.length;
    
    do {
        if (direction === 'next') {
            nextIndex = nextIndex < gameFlags.length - 1 ? nextIndex + 1 : 0;
        } else {
            nextIndex = nextIndex > 0 ? nextIndex - 1 : gameFlags.length - 1;
        }
        attempts++;
    } while (gameFlags[nextIndex].guessed && attempts < maxAttempts);
    
    return nextIndex;
}

function slideFlags(direction) {
    const flagsContainer = document.querySelector('.flags-container');
    
    // Find next unsolved flag
    currentIndex = findNextUnsolvedFlag(direction);
    
    // Update display and input IMMEDIATELY before animation
    updateFlagDisplay();
    
    // Add slide animation AFTER updating everything
    flagsContainer.classList.add(`slide-${direction === 'next' ? 'left' : 'right'}`);
    
    // Remove animation class after it completes
    setTimeout(() => {
        flagsContainer.classList.remove('slide-left', 'slide-right');
    }, 200);
}

function navigateFlags(direction) {
    slideFlags(direction);
    
    feedback.textContent = '';
    feedback.className = 'feedback';
}

function endGame() {
    // Handle case where timer never started
    if (!startTime) {
        document.getElementById('final-time').textContent = '00:00';
    } else {
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        const minutes = Math.floor(totalTime / 60000);
        const seconds = Math.floor((totalTime % 60000) / 1000);
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Show results
        document.getElementById('final-time').textContent = timeString;
    }
    
    const totalFlags = FLAGS_DATA.length;
    let successRate = Math.round((correctAnswers / totalFlags) * 100);
    
    
    document.getElementById('correct-count').textContent = `${correctAnswers}/${totalFlags}`;
    document.getElementById('success-rate').textContent = `${successRate}%`;
    
    // Celebrate if 100%
    if (successRate === 100) {
        celebrate();
    }
    
    // Save to local storage if 100% completion and timer was started
    if (successRate === 100 && startTime) {
        const totalTime = Date.now() - startTime;
        savePersonalBest(totalTime, successRate);
    }
    
    // Collect all missed flags (flags that were not guessed)
    const allMissedFlags = [];
    
    // Add explicitly skipped flags
    allMissedFlags.push(...missedFlags);
    
    // Add flags that were never guessed
    gameFlags.forEach(flag => {
        if (!flag.guessed) {
            allMissedFlags.push({
                url: flag.url,
                country: flag.country
            });
        }
    });
    
    // Show missed flags section only if there are missed flags
    const missedFlagsSection = document.querySelector('.missed-flags');
    const missedList = document.getElementById('missed-list');
    const missedCount = document.getElementById('missed-count');
    missedList.innerHTML = '';
    
    if (allMissedFlags.length > 0) {
        missedFlagsSection.style.display = 'block';
        missedCount.textContent = `(${allMissedFlags.length})`;
        allMissedFlags.forEach(flag => {
            const flagElement = document.createElement('div');
            flagElement.className = 'missed-flag';
            flagElement.innerHTML = `
                <img src="${flag.url}" alt="${flag.country}">
                <span class="country-name">${flag.country}</span>
            `;
            missedList.appendChild(flagElement);
        });
    } else {
        missedFlagsSection.style.display = 'none';
        missedCount.textContent = '';
    }
    
    // Show personal best if available
    displayPersonalBest();
    
    // Switch screens
    gameScreen.classList.remove('active');
    resultsScreen.classList.add('active');
    
    // Hide the top progress counter and timer section on results screen
    progressElement.style.display = 'none';
    document.querySelector('.top-right-section').style.display = 'none';
    
    // Stop timer
    startTime = null;
}

function savePersonalBest(time, successRate) {
    const pb = {
        time: time,
        successRate: successRate,
        date: new Date().toISOString()
    };
    
    const existingPB = localStorage.getItem('flagGamePB');
    if (!existingPB || JSON.parse(existingPB).time > time) {
        localStorage.setItem('flagGamePB', JSON.stringify(pb));
    }
}

function celebrate() {
    // Add celebration effects to body
    document.body.classList.add('celebration');
    
    // Start continuous confetti
    startContinuousConfetti();
}

let confettiInterval;

function startContinuousConfetti() {
    // Clear any existing interval
    if (confettiInterval) {
        clearInterval(confettiInterval);
    }
    
    // Create confetti bursts every 200ms
    confettiInterval = setInterval(() => {
        createConfettiBurst();
    }, 200);
}

function createConfettiBurst() {
    const colors = ['#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80', '#00ffff', '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080'];
    const container = document.body;
    
    for (let i = 0; i < 15; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        confetti.style.animationDuration = (Math.random() * 2 + 3) + 's';
        
        container.appendChild(confetti);
        
        // Remove confetti after animation
        setTimeout(() => {
            if (confetti.parentNode) {
                confetti.parentNode.removeChild(confetti);
            }
        }, 6000);
    }
}

function stopCelebration() {
    document.body.classList.remove('celebration');
    if (confettiInterval) {
        clearInterval(confettiInterval);
        confettiInterval = null;
    }
    
    // Remove remaining confetti
    const confettiElements = document.querySelectorAll('.confetti');
    confettiElements.forEach(el => el.remove());
}

function displayPersonalBest() {
    const pb = localStorage.getItem('flagGamePB');
    if (pb) {
        const personalBest = JSON.parse(pb);
        const minutes = Math.floor(personalBest.time / 60000);
        const seconds = Math.floor((personalBest.time % 60000) / 1000);
        const pbTimeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Add PB display to results
        const finalStats = document.querySelector('.final-stats');
        let pbElement = document.getElementById('personal-best');
        if (!pbElement) {
            pbElement = document.createElement('div');
            pbElement.id = 'personal-best';
            pbElement.className = 'stat';
            finalStats.appendChild(pbElement);
        }
        
        pbElement.innerHTML = `
            <span class="label">Personal Best:</span>
            <span>${pbTimeString} (100%)</span>
        `;
    }
}

function restartGame() {
    resultsScreen.classList.remove('active');
    gameScreen.classList.add('active');
    
    // Show timer section and progress elements again
    document.querySelector('.top-right-section').style.display = 'flex';
    progressElement.style.display = 'block';
    
    feedback.textContent = '';
    feedback.className = 'feedback';
    countryInput.value = '';
    
    // Reset timer display to 00:00
    timerElement.textContent = '00:00';
    
    // Show the top progress counter again
    progressElement.style.display = 'block';
    
    // Stop celebration if running
    stopCelebration();
    
    initializeGame();
}

// Event listeners
countryInput.addEventListener('input', () => {
    // Start timer on first input
    startTimer();
    
    if (countryInput.value.trim() && checkAnswer()) {
        handleCorrectAnswer();
    }
});

countryInput.addEventListener('keypress', (e) => {
    // Handle quote key for Google Docs
    if (e.key === '"') {
        e.preventDefault();
        openGoogleDocs();
        return;
    }
    
    // Start timer on first keypress
    startTimer();
    
    if (e.key === 'Enter' && countryInput.value.trim()) {
        if (!checkAnswer()) {
            handleIncorrectAnswer();
        }
    }
});

prevBtn.addEventListener('click', () => navigateFlags('prev'));
nextBtn.addEventListener('click', () => navigateFlags('next'));
giveUpBtn.addEventListener('click', endGame);
playAgainBtn.addEventListener('click', restartGame);

// Google Docs functionality
function openGoogleDocs() {
    window.open('https://docs.google.com', '_blank');
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Handle quote key for Google Docs (global)
    if (e.key === '"') {
        e.preventDefault();
        openGoogleDocs();
        return;
    }
    
    if (gameScreen.classList.contains('active')) {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateFlags('prev');
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateFlags('next');
        }
    }
});

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    if (FLAGS_DATA.length > 0) {
        initializeGame();
    } else {
        alert('Please add your flag data to the FLAGS_DATA array in script.js to start the game.');
    }
});