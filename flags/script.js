// Game state
let currentIndex = 0;
let startTime = null;
let pausedAt = null;
let totalPausedTime = 0;
let isPaused = false;
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
const pauseBtn = document.getElementById('pause-btn');
const playAgainBtn = document.getElementById('play-again-btn');

// Pause overlay
const pauseOverlay = document.getElementById('pause-overlay');

// Screen elements
const gameScreen = document.getElementById('game-screen');
const resultsScreen = document.getElementById('results-screen');

const FLAGS_DATA = [
    { url: 'assets/flags/dominica.png', country: 'Dominica' },
{ url: 'assets/flags/maldives.png', country: 'Maldives' },
{ url: 'assets/flags/papua-new-guinea.png', country: 'Papua New Guinea' },
{ url: 'assets/flags/slovakia.png', country: 'Slovakia' },
{ url: 'assets/flags/solomon-islands.png', country: 'Solomon Islands' },
{ url: 'assets/flags/panama.png', country: 'Panama' },
{ url: 'assets/flags/south-africa.png', country: 'South Africa' },
{ url: 'assets/flags/mexico.png', country: 'Mexico' },
{ url: 'assets/flags/kazakhstan.png', country: 'Kazakhstan' },
{ url: 'assets/flags/seychelles.png', country: 'Seychelles' },
{ url: 'assets/flags/finland.png', country: 'Finland' },
{ url: 'assets/flags/benin.png', country: 'Benin' },
{ url: 'assets/flags/estonia.png', country: 'Estonia' },
{ url: 'assets/flags/madagascar.png', country: 'Madagascar' },
{ url: 'assets/flags/north-korea.png', country: 'North Korea' },
{ url: 'assets/flags/bhutan.png', country: 'Bhutan' },
{ url: 'assets/flags/albania.png', country: 'Albania' },
{ url: 'assets/flags/kosovo.png', country: 'Kosovo' },
{ url: 'assets/flags/mongolia.png', country: 'Mongolia' },
{ url: 'assets/flags/italy.png', country: 'Italy' },
{ url: 'assets/flags/austria.png', country: 'Austria' },
{ url: 'assets/flags/nauru.png', country: 'Nauru' },
{ url: 'assets/flags/singapore.png', country: 'Singapore' },
{ url: 'assets/flags/cuba.png', country: 'Cuba' },
{ url: 'assets/flags/equatorial-guinea.png', country: 'Equatorial Guinea' },
{ url: 'assets/flags/bosnia-and-herzegovina.png', country: 'Bosnia and Herzegovina' },
{ url: 'assets/flags/denmark.png', country: 'Denmark' },
{ url: 'assets/flags/vietnam.png', country: 'Vietnam' },
{ url: 'assets/flags/india.png', country: 'India' },
{ url: 'assets/flags/montenegro.png', country: 'Montenegro' },
{ url: 'assets/flags/nicaragua.png', country: 'Nicaragua' },
{ url: 'assets/flags/suriname.png', country: 'Suriname' },
{ url: 'assets/flags/iraq.png', country: 'Iraq' },
{ url: 'assets/flags/indonesia.png', country: 'Indonesia' },
{ url: 'assets/flags/kuwait.png', country: 'Kuwait' },
{ url: 'assets/flags/mali.png', country: 'Mali' },
{ url: 'assets/flags/georgia.png', country: 'Georgia' },
{ url: 'assets/flags/uzbekistan.png', country: 'Uzbekistan' },
{ url: 'assets/flags/spain.png', country: 'Spain' },
{ url: 'assets/flags/romania.png', country: 'Romania' },
{ url: 'assets/flags/argentina.png', country: 'Argentina' },
{ url: 'assets/flags/norway.png', country: 'Norway' },
{ url: 'assets/flags/kiribati.png', country: 'Kiribati' },
{ url: 'assets/flags/colombia.png', country: 'Colombia' },
{ url: 'assets/flags/antigua-and-barbuda.png', country: 'Antigua and Barbuda' },
{ url: 'assets/flags/ireland.png', country: 'Ireland' },
{ url: 'assets/flags/central-african-republic.png', country: 'Central African Republic' },
{ url: 'assets/flags/vanuatu.png', country: 'Vanuatu' },
{ url: 'assets/flags/bangladesh.png', country: 'Bangladesh' },
{ url: 'assets/flags/ghana.png', country: 'Ghana' },
{ url: 'assets/flags/senegal.png', country: 'Senegal' },
{ url: 'assets/flags/tanzania.png', country: 'Tanzania' },
{ url: 'assets/flags/belgium.png', country: 'Belgium' },
{ url: 'assets/flags/hungary.png', country: 'Hungary' },
{ url: 'assets/flags/netherlands.png', country: 'Netherlands' },
{ url: 'assets/flags/liberia.png', country: 'Liberia' },
{ url: 'assets/flags/latvia.png', country: 'Latvia' },
{ url: 'assets/flags/israel.png', country: 'Israel' },
{ url: 'assets/flags/burundi.png', country: 'Burundi' },
{ url: 'assets/flags/saudi-arabia.png', country: 'Saudi Arabia' },
{ url: 'assets/flags/belarus.png', country: 'Belarus' },
{ url: 'assets/flags/lebanon.png', country: 'Lebanon' },
{ url: 'assets/flags/ukraine.png', country: 'Ukraine' },
{ url: 'assets/flags/burkina-faso.png', country: 'Burkina Faso' },
{ url: 'assets/flags/united-arab-emirates.png', country: 'United Arab Emirates' },
{ url: 'assets/flags/tuvalu.png', country: 'Tuvalu' },
{ url: 'assets/flags/moldova.png', country: 'Moldova' },
{ url: 'assets/flags/france.png', country: 'France' },
{ url: 'assets/flags/mauritania.png', country: 'Mauritania' },
{ url: 'assets/flags/costa-rica.png', country: 'Costa Rica' },
{ url: 'assets/flags/botswana.png', country: 'Botswana' },
{ url: 'assets/flags/malaysia.png', country: 'Malaysia' },
{ url: 'assets/flags/namibia.png', country: 'Namibia' },
{ url: 'assets/flags/pakistan.png', country: 'Pakistan' },
{ url: 'assets/flags/croatia.png', country: 'Croatia' },
{ url: 'assets/flags/egypt.png', country: 'Egypt' },
{ url: 'assets/flags/greece.png', country: 'Greece' },
{ url: 'assets/flags/malta.png', country: 'Malta' },
{ url: 'assets/flags/ecuador.png', country: 'Ecuador' },
{ url: 'assets/flags/angola.png', country: 'Angola' },
{ url: 'assets/flags/taiwan.png', country: 'Taiwan' },
{ url: 'assets/flags/chad.png', country: 'Chad' },
{ url: 'assets/flags/chile.png', country: 'Chile' },
{ url: 'assets/flags/uganda.png', country: 'Uganda' },
{ url: 'assets/flags/laos.png', country: 'Laos' },
{ url: 'assets/flags/guinea.png', country: 'Guinea' },
{ url: 'assets/flags/marshall-islands.png', country: 'Marshall Islands' },
{ url: 'assets/flags/belize.png', country: 'Belize' },
{ url: 'assets/flags/kenya.png', country: 'Kenya' },
{ url: 'assets/flags/andorra.png', country: 'Andorra' },
{ url: 'assets/flags/brunei.png', country: 'Brunei' },
{ url: 'assets/flags/togo.png', country: 'Togo' },
{ url: 'assets/flags/qatar.png', country: 'Qatar' },
{ url: 'assets/flags/morocco.png', country: 'Morocco' },
{ url: 'assets/flags/uruguay.png', country: 'Uruguay' },
{ url: 'assets/flags/samoa.png', country: 'Samoa' },
{ url: 'assets/flags/nigeria.png', country: 'Nigeria' },
{ url: 'assets/flags/gabon.png', country: 'Gabon' },
{ url: 'assets/flags/thailand.png', country: 'Thailand' },
{ url: 'assets/flags/peru.png', country: 'Peru' },
{ url: 'assets/flags/poland.png', country: 'Poland' },
{ url: 'assets/flags/paraguay.png', country: 'Paraguay' },
{ url: 'assets/flags/jordan.png', country: 'Jordan' },
{ url: 'assets/flags/guinea-bissau.png', country: 'Guinea Bissau' },
{ url: 'assets/flags/barbados.png', country: 'Barbados' },
{ url: 'assets/flags/saint-lucia.png', country: 'Saint Lucia' },
{ url: 'assets/flags/myanmar.png', country: 'Myanmar' },
{ url: 'assets/flags/zimbabwe.png', country: 'Zimbabwe' },
{ url: 'assets/flags/grenada.png', country: 'Grenada' },
{ url: 'assets/flags/bahrain.png', country: 'Bahrain' },
{ url: 'assets/flags/south-korea.png', country: 'South Korea' },
{ url: 'assets/flags/luxembourg.png', country: 'Luxembourg' },
{ url: 'assets/flags/syria.png', country: 'Syria' },
{ url: 'assets/flags/jamaica.png', country: 'Jamaica' },
{ url: 'assets/flags/guyana.png', country: 'Guyana' },
{ url: 'assets/flags/fiji.png', country: 'Fiji' },
{ url: 'assets/flags/bahamas.png', country: 'Bahamas' },
{ url: 'assets/flags/sudan.png', country: 'Sudan' },
{ url: 'assets/flags/rwanda.png', country: 'Rwanda' },
{ url: 'assets/flags/somalia.png', country: 'Somalia' },
{ url: 'assets/flags/lesotho.png', country: 'Lesotho' },
{ url: 'assets/flags/djibouti.png', country: 'Djibouti' },
{ url: 'assets/flags/slovenia.png', country: 'Slovenia' },
{ url: 'assets/flags/saint-vincent-and-the-grenadines.png', country: 'Saint Vincent and the Grenadines' },
{ url: 'assets/flags/niger.png', country: 'Niger' },
{ url: 'assets/flags/venezuela.png', country: 'Venezuela' },
{ url: 'assets/flags/guatemala.png', country: 'Guatemala' },
{ url: 'assets/flags/malawi.png', country: 'Malawi' },
{ url: 'assets/flags/germany.png', country: 'Germany' },
{ url: 'assets/flags/dominican-republic.png', country: 'Dominican Republic' },
{ url: 'assets/flags/san-marino.png', country: 'San Marino' },
{ url: 'assets/flags/el-salvador.png', country: 'El Salvador' },
{ url: 'assets/flags/mauritius.png', country: 'Mauritius' },
{ url: 'assets/flags/tunisia.png', country: 'Tunisia' },
{ url: 'assets/flags/cambodia.png', country: 'Cambodia' },
{ url: 'assets/flags/sweden.png', country: 'Sweden' },
{ url: 'assets/flags/japan.png', country: 'Japan' },
{ url: 'assets/flags/united-kingdom.png', country: 'United Kingdom' },
{ url: 'assets/flags/vatican-city.png', country: 'Vatican City' },
{ url: 'assets/flags/sri-lanka.png', country: 'Sri Lanka' },
{ url: 'assets/flags/cyprus.png', country: 'Cyprus' },
{ url: 'assets/flags/lithuania.png', country: 'Lithuania' },
{ url: 'assets/flags/iran.png', country: 'Iran' },
{ url: 'assets/flags/philippines.png', country: 'Philippines' },
{ url: 'assets/flags/sierra-leone.png', country: 'Sierra Leone' },
{ url: 'assets/flags/iceland.png', country: 'Iceland' },
{ url: 'assets/flags/libya.png', country: 'Libya' },
{ url: 'assets/flags/canada.png', country: 'Canada' },
{ url: 'assets/flags/comoros.png', country: 'Comoros' },
{ url: 'assets/flags/russia.png', country: 'Russia' },
{ url: 'assets/flags/algeria.png', country: 'Algeria' },
{ url: 'assets/flags/south-sudan.png', country: 'South Sudan' },
{ url: 'assets/flags/mozambique.png', country: 'Mozambique' },
{ url: 'assets/flags/armenia.png', country: 'Armenia' },
{ url: 'assets/flags/micronesia.png', country: 'Micronesia' },
{ url: 'assets/flags/haiti.png', country: 'Haiti' },
{ url: 'assets/flags/honduras.png', country: 'Honduras' },
{ url: 'assets/flags/trinidad-and-tobago.png', country: 'Trinidad and Tobago' },
{ url: 'assets/flags/azerbaijan.png', country: 'Azerbaijan' },
{ url: 'assets/flags/kyrgyzstan.png', country: 'Kyrgyzstan' },
{ url: 'assets/flags/bulgaria.png', country: 'Bulgaria' },
{ url: 'assets/flags/zambia.png', country: 'Zambia' },
{ url: 'assets/flags/north-macedonia.png', country: 'North Macedonia' },
{ url: 'assets/flags/switzerland.png', country: 'Switzerland' },
{ url: 'assets/flags/oman.png', country: 'Oman' },
{ url: 'assets/flags/nepal.png', country: 'Nepal' },
{ url: 'assets/flags/palau.png', country: 'Palau' },
{ url: 'assets/flags/cameroon.png', country: 'Cameroon' },
{ url: 'assets/flags/turkmenistan.png', country: 'Turkmenistan' },
{ url: 'assets/flags/tonga.png', country: 'Tonga' },
{ url: 'assets/flags/new-zealand.png', country: 'New Zealand' },
{ url: 'assets/flags/afghanistan.png', country: 'Afghanistan' },
{ url: 'assets/flags/ethiopia.png', country: 'Ethiopia' },
{ url: 'assets/flags/liechtenstein.png', country: 'Liechtenstein' },
{ url: 'assets/flags/china.png', country: 'China' },
{ url: 'assets/flags/eritrea.png', country: 'Eritrea' },
{ url: 'assets/flags/serbia.png', country: 'Serbia' },
{ url: 'assets/flags/australia.png', country: 'Australia' },
{ url: 'assets/flags/tajikistan.png', country: 'Tajikistan' },
{ url: 'assets/flags/bolivia.png', country: 'Bolivia' },
{ url: 'assets/flags/saint-kitts-and-nevis.png', country: 'Saint Kitts and Nevis' },
{ url: 'assets/flags/portugal.png', country: 'Portugal' },
{ url: 'assets/flags/yemen.png', country: 'Yemen' },
{ url: 'assets/flags/monaco.png', country: 'Monaco' },
{ url: 'assets/flags/palestine.png', country: 'Palestine' },
{ url: 'assets/flags/brazil.png', country: 'Brazil' },
{ url: 'assets/flags/gambia.png', country: 'The Gambia' },
{ url: 'assets/flags/swaziland.png', country: 'Eswatini' },
{ url: 'assets/flags/congo-democratic-republic-of-the.png', country: 'Democratic Republic of the Congo' },
{ url: 'assets/flags/united-states-of-america.png', country: 'United States' },
{ url: 'assets/flags/east-timor.png', country: 'Timor Leste' },
{ url: 'assets/flags/turkey.png', country: 'Türkiye' },
{ url: 'assets/flags/cote-d-ivoire.png', country: 'Côte D’ivoire' },
{ url: 'assets/flags/czech-republic.png', country: 'Czechia' },
{ url: 'assets/flags/congo-republic-of-the.png', country: 'Republic of the Congo' },
{ url: 'assets/flags/sao-tome-and-principe.png', country: 'São Tomé and Príncipe' },
{ url: 'assets/flags/cape-verde.png', country: 'Cabo Verde' },

];

// TODO: Replace this with your abbreviations data
// Format: { 'abbreviation': 'Full Country Name' }
const ABBREVIATIONS = {
    'usa': 'United States',
    'uk': 'United Kingdom',
    'car': 'Central African Republic',
    'drc': 'Democratic Republic of the Congo',
    'the democratic republic of the congo': 'Democratic Republic of the Congo',
    'the democratic republic of congo': 'Democratic Republic of the Congo',
    'democratic republic of congo': 'Democratic Republic of the Congo',
    'republic of congo': 'Republic of the Congo',
    'democratic republic of congo': 'Democratic Republic of the Congo',
    'skan': 'Saint Kitts and Nevis',
    'st kitts and nevis': 'Saint Kitts and Nevis',
    'st vincent': 'Saint Vincent and the Grenadines',
    'gambia': 'The Gambia',
    'the gambia': 'The Gambia',
    'bahamas': 'Bahamas',
    'the bahamas': 'Bahamas',
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
    'turkey': 'Türkiye',
    'turkiye': 'Türkiye',
    'dprk': 'North Korea',
    'the philippines': 'Philippines'
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
    gameFlags = shuffleArray(FLAGS_DATA).map(flag => ({
        url: flag.url,
        country: flag.country
        // Don't copy the 'guessed' property to ensure fresh start
    }));
    abbreviations = { ...ABBREVIATIONS };
    currentIndex = 0;
    correctAnswers = 0;
    missedFlags = [];
    startTime = null; // Don't start timer yet
    pausedAt = null;
    totalPausedTime = 0;
    isPaused = false;
    pauseOverlay.classList.remove('active');
    pauseBtn.textContent = 'Pause';

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
    totalPausedTime = 0;

    // Flash the timer to indicate it started
    timerElement.classList.add('timer-flash');
    setTimeout(() => {
        timerElement.classList.remove('timer-flash');
    }, 600);

    function updateTimer() {
        if (!startTime) return;
        if (isPaused) {
            requestAnimationFrame(updateTimer);
            return;
        }

        const elapsed = Date.now() - startTime - totalPausedTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);

        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        requestAnimationFrame(updateTimer);
    }
    updateTimer();
}

function togglePause() {
    if (!startTime) return; // Don't allow pause before game starts

    isPaused = !isPaused;

    if (isPaused) {
        pausedAt = Date.now();
        pauseOverlay.classList.add('active');
        pauseBtn.textContent = 'Resume';
        countryInput.blur();
    } else {
        totalPausedTime += Date.now() - pausedAt;
        pausedAt = null;
        pauseOverlay.classList.remove('active');
        pauseBtn.textContent = 'Pause';
        countryInput.focus();
    }
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

function findRandomUnsolvedFlag() {
    const unsolved = gameFlags
        .map((flag, i) => ({ flag, i }))
        .filter(({ flag, i }) => !flag.guessed && i !== currentIndex);

    if (unsolved.length === 0) return currentIndex;
    return unsolved[Math.floor(Math.random() * unsolved.length)].i;
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
        const totalTime = endTime - startTime - totalPausedTime;
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
    
    // Save personal best (either time-based for 100% or flag count-based for <100%)
    // Returns 'time', 'flags', or null
    let newRecordType = null;
    if (startTime) {
        const totalTime = Date.now() - startTime - totalPausedTime;
        newRecordType = savePersonalBest(totalTime, successRate, correctAnswers);
    } else {
        // No timer started, just save flag count
        newRecordType = savePersonalBest(0, successRate, correctAnswers);
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
    displayPersonalBest(newRecordType);

    // Clear stale flag PB after display - 100% supersedes any partial completion record
    if (successRate === 100) {
        localStorage.removeItem('flagGameFlagPB');
        localStorage.removeItem('flagGamePreviousFlagPB');
    }

    // Switch screens
    gameScreen.classList.remove('active');
    resultsScreen.classList.add('active');
    
    // Hide the top progress counter and timer section on results screen
    progressElement.style.display = 'none';
    document.querySelector('.top-right-section').style.display = 'none';
    
    // Stop timer and reset pause
    startTime = null;
    isPaused = false;
    pauseOverlay.classList.remove('active');
    pauseBtn.textContent = 'Pause';
}

function savePersonalBest(time, successRate, flagCount) {
    const totalFlags = FLAGS_DATA.length;

    // Don't save PB if 0% completion
    if (successRate === 0) {
        return null;
    }

    if (successRate === 100) {
        // For 100% completion, use time-based PB
        const newTimePB = {
            time: time,
            successRate: successRate,
            flagCount: flagCount,
            type: 'time',
            date: new Date().toISOString()
        };

        const existingTimePB = localStorage.getItem('flagGameTimePB');

        if (!existingTimePB || JSON.parse(existingTimePB).time > time) {
            // Store previous time PB before saving new one
            if (existingTimePB) {
                localStorage.setItem('flagGamePreviousTimePB', existingTimePB);
            }
            localStorage.setItem('flagGameTimePB', JSON.stringify(newTimePB));
            return 'time';
        }
    } else {
        // For <100% completion, use flag count-based PB
        const newFlagPB = {
            flagCount: flagCount,
            successRate: successRate,
            time: time,
            type: 'flags',
            date: new Date().toISOString()
        };

        const existingFlagPB = localStorage.getItem('flagGameFlagPB');

        if (!existingFlagPB || JSON.parse(existingFlagPB).flagCount < flagCount) {
            // Store previous flag PB before saving new one
            if (existingFlagPB) {
                localStorage.setItem('flagGamePreviousFlagPB', existingFlagPB);
            }
            localStorage.setItem('flagGameFlagPB', JSON.stringify(newFlagPB));
            return 'flags';
        }
    }

    return null;
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

function displayPersonalBest(newRecordType = null) {
    const timePB = localStorage.getItem('flagGameTimePB');
    const flagPB = localStorage.getItem('flagGameFlagPB');
    const previousTimePB = localStorage.getItem('flagGamePreviousTimePB');
    const previousFlagPB = localStorage.getItem('flagGamePreviousFlagPB');

    // Add PB display to results
    const finalStats = document.querySelector('.final-stats');
    let pbElement = document.getElementById('personal-best');
    if (!pbElement) {
        pbElement = document.createElement('div');
        pbElement.id = 'personal-best';
        pbElement.className = 'stat';
        finalStats.appendChild(pbElement);
    }

    // If no PB exists, don't show anything
    if (!timePB && !flagPB) {
        pbElement.style.display = 'none';
        return;
    }

    // Build display using DOM methods
    pbElement.textContent = '';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'Personal Best:';
    pbElement.appendChild(label);

    function formatTime(ms) {
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        return m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
    }

    // Show time-based PB if it exists (100% completion records)
    if (timePB) {
        const personalBest = JSON.parse(timePB);
        const pbTimeString = formatTime(personalBest.time);

        if (newRecordType === 'time' && previousTimePB) {
            // New time record with a previous one to show strikethrough
            const prevPB = JSON.parse(previousTimePB);
            const prevTimeString = formatTime(prevPB.time);

            const div = document.createElement('div');
            const prevSpan = document.createElement('span');
            prevSpan.className = 'previous-pb';
            prevSpan.textContent = prevTimeString + ' (100%)';
            div.appendChild(prevSpan);
            div.appendChild(document.createElement('br'));
            const newSpan = document.createElement('span');
            newSpan.className = 'gradient-text';
            newSpan.textContent = pbTimeString + ' (100%) - NEW BEST!';
            div.appendChild(newSpan);
            pbElement.appendChild(div);
        } else if (newRecordType === 'time') {
            // First 100% completion - show with gradient
            pbElement.appendChild(document.createElement('br'));
            const span = document.createElement('span');
            span.className = 'gradient-text';
            span.textContent = '\u23F1\uFE0F ' + pbTimeString + ' (100%) - NEW BEST!';
            pbElement.appendChild(span);
        } else {
            pbElement.appendChild(document.createElement('br'));
            const span = document.createElement('span');
            span.textContent = '\u23F1\uFE0F ' + pbTimeString + ' (100%)';
            pbElement.appendChild(span);
        }
    }

    // Show flag-based PB if it exists (partial completion records)
    if (flagPB) {
        const flagPersonalBest = JSON.parse(flagPB);
        const totalFlags = FLAGS_DATA.length;
        const pct = Math.round((flagPersonalBest.flagCount / totalFlags) * 100);
        const flagText = '\uD83D\uDEA9 ' + flagPersonalBest.flagCount + '/' + totalFlags + ' flags (' + pct + '%)';

        if (timePB) pbElement.appendChild(document.createElement('br'));

        if (newRecordType === 'time' && flagPersonalBest.successRate < 100) {
            // 100% completion supersedes partial record - show with strikethrough
            const span = document.createElement('span');
            span.className = 'previous-pb';
            span.textContent = flagText;
            pbElement.appendChild(span);
        } else if (newRecordType === 'flags' && previousFlagPB) {
            // New flag record with a previous one to show strikethrough
            const prevFlagPB = JSON.parse(previousFlagPB);
            const prevPct = Math.round((prevFlagPB.flagCount / totalFlags) * 100);
            const prevSpan = document.createElement('span');
            prevSpan.className = 'previous-pb';
            prevSpan.textContent = '\uD83D\uDEA9 ' + prevFlagPB.flagCount + '/' + totalFlags + ' flags (' + prevPct + '%)';
            pbElement.appendChild(prevSpan);
            pbElement.appendChild(document.createElement('br'));
            const newSpan = document.createElement('span');
            newSpan.className = 'gradient-text';
            newSpan.textContent = flagText + ' NEW BEST!';
            pbElement.appendChild(newSpan);
        } else {
            // Show flag PB (with NEW BEST only if this game set a new flag record)
            const span = document.createElement('span');
            if (newRecordType === 'flags') {
                span.className = 'gradient-text';
                span.textContent = flagText + ' NEW BEST!';
            } else {
                span.textContent = flagText;
            }
            pbElement.appendChild(span);
        }
    }

    pbElement.style.display = 'flex';
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
pauseBtn.addEventListener('click', togglePause);
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
        if (e.key === 'Escape') {
            if (startTime) {
                e.preventDefault();
                togglePause();
                return;
            }
        }

        if (!isPaused) {
            const canNav = document.activeElement !== countryInput || e.shiftKey;
            if (canNav && e.key === 'ArrowLeft')  { e.preventDefault(); navigateFlags('prev'); }
            if (canNav && e.key === 'ArrowRight') { e.preventDefault(); navigateFlags('next'); }
        }
    }
});

// Preload all flag images into the browser cache
function preloadImages() {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingBar = document.getElementById('loading-bar');
    const loadingCount = document.getElementById('loading-count');
    const total = FLAGS_DATA.length;
    let loaded = 0;

    return new Promise(resolve => {
        FLAGS_DATA.forEach(flag => {
            const img = new Image();
            img.onload = img.onerror = () => {
                loaded++;
                const pct = Math.round((loaded / total) * 100);
                loadingBar.style.width = pct + '%';
                loadingCount.textContent = `${loaded} / ${total}`;
                if (loaded === total) resolve();
            };
            img.src = flag.url;
        });
    });
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', async () => {
    if (FLAGS_DATA.length > 0) {
        await preloadImages();
        document.getElementById('loading-overlay').classList.add('hidden');
        initializeGame();
    } else {
        alert('Please add your flag data to the FLAGS_DATA array in script.js to start the game.');
    }
});