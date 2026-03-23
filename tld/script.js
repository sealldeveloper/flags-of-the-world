// Game state
let currentIndex = 0;
let startTime = null;
let pausedAt = null;
let totalPausedTime = 0;
let isPaused = false;
let correctAnswers = 0;
let gameItems = [];
let hintUsedSet = new Set();
let hintVisible = false;

// DOM references
const timerElement    = document.getElementById('timer');
const progressElement = document.getElementById('progress');
const countryInput    = document.getElementById('country-input');
const currentTldEl    = document.getElementById('current-tld');
const prevTldEl       = document.getElementById('prev-tld');
const nextTldEl       = document.getElementById('next-tld');
const feedback        = document.getElementById('feedback');
const hintArea        = document.getElementById('hint-area');
const hintFlag        = document.getElementById('hint-flag');
const hintBtn         = document.getElementById('hint-btn');
const prevBtn         = document.getElementById('prev-btn');
const nextBtn         = document.getElementById('next-btn');
const giveUpBtn       = document.getElementById('give-up-btn');
const pauseBtn        = document.getElementById('pause-btn');
const playAgainBtn    = document.getElementById('play-again-btn');
const pauseOverlay    = document.getElementById('pause-overlay');
const gameScreen      = document.getElementById('game-screen');
const resultsScreen   = document.getElementById('results-screen');

const TLD_DATA = [
    { tld: '.dm', country: 'Dominica',                         flagUrl: 'https://cdn.countryflags.com/thumbs/dominica/flag-800.png' },
    { tld: '.mv', country: 'Maldives',                         flagUrl: 'https://cdn.countryflags.com/thumbs/maldives/flag-800.png' },
    { tld: '.pg', country: 'Papua New Guinea',                 flagUrl: 'https://cdn.countryflags.com/thumbs/papua-new-guinea/flag-800.png' },
    { tld: '.sk', country: 'Slovakia',                         flagUrl: 'https://cdn.countryflags.com/thumbs/slovakia/flag-800.png' },
    { tld: '.sb', country: 'Solomon Islands',                  flagUrl: 'https://cdn.countryflags.com/thumbs/solomon-islands/flag-800.png' },
    { tld: '.pa', country: 'Panama',                           flagUrl: 'https://cdn.countryflags.com/thumbs/panama/flag-800.png' },
    { tld: '.za', country: 'South Africa',                     flagUrl: 'https://cdn.countryflags.com/thumbs/south-africa/flag-800.png' },
    { tld: '.mx', country: 'Mexico',                           flagUrl: 'https://cdn.countryflags.com/thumbs/mexico/flag-800.png' },
    { tld: '.kz', country: 'Kazakhstan',                       flagUrl: 'https://cdn.countryflags.com/thumbs/kazakhstan/flag-800.png' },
    { tld: '.sc', country: 'Seychelles',                       flagUrl: 'https://cdn.countryflags.com/thumbs/seychelles/flag-800.png' },
    { tld: '.fi', country: 'Finland',                          flagUrl: 'https://cdn.countryflags.com/thumbs/finland/flag-800.png' },
    { tld: '.bj', country: 'Benin',                            flagUrl: 'https://cdn.countryflags.com/thumbs/benin/flag-800.png' },
    { tld: '.ee', country: 'Estonia',                          flagUrl: 'https://cdn.countryflags.com/thumbs/estonia/flag-800.png' },
    { tld: '.mg', country: 'Madagascar',                       flagUrl: 'https://cdn.countryflags.com/thumbs/madagascar/flag-800.png' },
    { tld: '.kp', country: 'North Korea',                      flagUrl: 'https://cdn.countryflags.com/thumbs/north-korea/flag-800.png' },
    { tld: '.bt', country: 'Bhutan',                           flagUrl: 'https://cdn.countryflags.com/thumbs/bhutan/flag-800.png' },
    { tld: '.al', country: 'Albania',                          flagUrl: 'https://cdn.countryflags.com/thumbs/albania/flag-800.png' },
    { tld: '.xk', country: 'Kosovo',                           flagUrl: 'https://cdn.countryflags.com/thumbs/kosovo/flag-800.png' },
    { tld: '.mn', country: 'Mongolia',                         flagUrl: 'https://cdn.countryflags.com/thumbs/mongolia/flag-800.png' },
    { tld: '.it', country: 'Italy',                            flagUrl: 'https://cdn.countryflags.com/thumbs/italy/flag-800.png' },
    { tld: '.at', country: 'Austria',                          flagUrl: 'https://cdn.countryflags.com/thumbs/austria/flag-800.png' },
    { tld: '.nr', country: 'Nauru',                            flagUrl: 'https://cdn.countryflags.com/thumbs/nauru/flag-800.png' },
    { tld: '.sg', country: 'Singapore',                        flagUrl: 'https://cdn.countryflags.com/thumbs/singapore/flag-800.png' },
    { tld: '.cu', country: 'Cuba',                             flagUrl: 'https://cdn.countryflags.com/thumbs/cuba/flag-800.png' },
    { tld: '.gq', country: 'Equatorial Guinea',                flagUrl: 'https://cdn.countryflags.com/thumbs/equatorial-guinea/flag-800.png' },
    { tld: '.ba', country: 'Bosnia and Herzegovina',           flagUrl: 'https://cdn.countryflags.com/thumbs/bosnia-and-herzegovina/flag-800.png' },
    { tld: '.dk', country: 'Denmark',                          flagUrl: 'https://cdn.countryflags.com/thumbs/denmark/flag-800.png' },
    { tld: '.vn', country: 'Vietnam',                          flagUrl: 'https://cdn.countryflags.com/thumbs/vietnam/flag-800.png' },
    { tld: '.in', country: 'India',                            flagUrl: 'https://cdn.countryflags.com/thumbs/india/flag-800.png' },
    { tld: '.me', country: 'Montenegro',                       flagUrl: 'https://cdn.countryflags.com/thumbs/montenegro/flag-800.png' },
    { tld: '.ni', country: 'Nicaragua',                        flagUrl: 'https://cdn.countryflags.com/thumbs/nicaragua/flag-800.png' },
    { tld: '.sr', country: 'Suriname',                         flagUrl: 'https://cdn.countryflags.com/thumbs/suriname/flag-800.png' },
    { tld: '.iq', country: 'Iraq',                             flagUrl: 'https://cdn.countryflags.com/thumbs/iraq/flag-800.png' },
    { tld: '.id', country: 'Indonesia',                        flagUrl: 'https://cdn.countryflags.com/thumbs/indonesia/flag-800.png' },
    { tld: '.kw', country: 'Kuwait',                           flagUrl: 'https://cdn.countryflags.com/thumbs/kuwait/flag-800.png' },
    { tld: '.ml', country: 'Mali',                             flagUrl: 'https://cdn.countryflags.com/thumbs/mali/flag-800.png' },
    { tld: '.ge', country: 'Georgia',                          flagUrl: 'https://cdn.countryflags.com/thumbs/georgia/flag-800.png' },
    { tld: '.uz', country: 'Uzbekistan',                       flagUrl: 'https://cdn.countryflags.com/thumbs/uzbekistan/flag-800.png' },
    { tld: '.es', country: 'Spain',                            flagUrl: 'https://cdn.countryflags.com/thumbs/spain/flag-800.png' },
    { tld: '.ro', country: 'Romania',                          flagUrl: 'https://cdn.countryflags.com/thumbs/romania/flag-800.png' },
    { tld: '.ar', country: 'Argentina',                        flagUrl: 'https://cdn.countryflags.com/thumbs/argentina/flag-800.png' },
    { tld: '.no', country: 'Norway',                           flagUrl: 'https://cdn.countryflags.com/thumbs/norway/flag-800.png' },
    { tld: '.ki', country: 'Kiribati',                         flagUrl: 'https://cdn.countryflags.com/thumbs/kiribati/flag-800.png' },
    { tld: '.co', country: 'Colombia',                         flagUrl: 'https://cdn.countryflags.com/thumbs/colombia/flag-800.png' },
    { tld: '.ag', country: 'Antigua and Barbuda',              flagUrl: 'https://cdn.countryflags.com/thumbs/antigua-and-barbuda/flag-800.png' },
    { tld: '.ie', country: 'Ireland',                          flagUrl: 'https://cdn.countryflags.com/thumbs/ireland/flag-800.png' },
    { tld: '.cf', country: 'Central African Republic',         flagUrl: 'https://cdn.countryflags.com/thumbs/central-african-republic/flag-800.png' },
    { tld: '.vu', country: 'Vanuatu',                          flagUrl: 'https://cdn.countryflags.com/thumbs/vanuatu/flag-800.png' },
    { tld: '.bd', country: 'Bangladesh',                       flagUrl: 'https://cdn.countryflags.com/thumbs/bangladesh/flag-800.png' },
    { tld: '.gh', country: 'Ghana',                            flagUrl: 'https://cdn.countryflags.com/thumbs/ghana/flag-800.png' },
    { tld: '.sn', country: 'Senegal',                          flagUrl: 'https://cdn.countryflags.com/thumbs/senegal/flag-800.png' },
    { tld: '.tz', country: 'Tanzania',                         flagUrl: 'https://cdn.countryflags.com/thumbs/tanzania/flag-800.png' },
    { tld: '.be', country: 'Belgium',                          flagUrl: 'https://cdn.countryflags.com/thumbs/belgium/flag-800.png' },
    { tld: '.hu', country: 'Hungary',                          flagUrl: 'https://cdn.countryflags.com/thumbs/hungary/flag-800.png' },
    { tld: '.nl', country: 'Netherlands',                      flagUrl: 'https://cdn.countryflags.com/thumbs/netherlands/flag-800.png' },
    { tld: '.lr', country: 'Liberia',                          flagUrl: 'https://cdn.countryflags.com/thumbs/liberia/flag-800.png' },
    { tld: '.lv', country: 'Latvia',                           flagUrl: 'https://cdn.countryflags.com/thumbs/latvia/flag-800.png' },
    { tld: '.il', country: 'Israel',                           flagUrl: 'https://cdn.countryflags.com/thumbs/israel/flag-800.png' },
    { tld: '.bi', country: 'Burundi',                          flagUrl: 'https://cdn.countryflags.com/thumbs/burundi/flag-800.png' },
    { tld: '.sa', country: 'Saudi Arabia',                     flagUrl: 'https://cdn.countryflags.com/thumbs/saudi-arabia/flag-800.png' },
    { tld: '.by', country: 'Belarus',                          flagUrl: 'https://cdn.countryflags.com/thumbs/belarus/flag-800.png' },
    { tld: '.lb', country: 'Lebanon',                          flagUrl: 'https://cdn.countryflags.com/thumbs/lebanon/flag-800.png' },
    { tld: '.ua', country: 'Ukraine',                          flagUrl: 'https://cdn.countryflags.com/thumbs/ukraine/flag-800.png' },
    { tld: '.bf', country: 'Burkina Faso',                     flagUrl: 'https://cdn.countryflags.com/thumbs/burkina-faso/flag-800.png' },
    { tld: '.ae', country: 'United Arab Emirates',             flagUrl: 'https://cdn.countryflags.com/thumbs/united-arab-emirates/flag-800.png' },
    { tld: '.tv', country: 'Tuvalu',                           flagUrl: 'https://cdn.countryflags.com/thumbs/tuvalu/flag-800.png' },
    { tld: '.md', country: 'Moldova',                          flagUrl: 'https://cdn.countryflags.com/thumbs/moldova/flag-800.png' },
    { tld: '.fr', country: 'France',                           flagUrl: 'https://cdn.countryflags.com/thumbs/france/flag-800.png' },
    { tld: '.mr', country: 'Mauritania',                       flagUrl: 'https://cdn.countryflags.com/thumbs/mauritania/flag-800.png' },
    { tld: '.cr', country: 'Costa Rica',                       flagUrl: 'https://cdn.countryflags.com/thumbs/costa-rica/flag-800.png' },
    { tld: '.bw', country: 'Botswana',                         flagUrl: 'https://cdn.countryflags.com/thumbs/botswana/flag-800.png' },
    { tld: '.my', country: 'Malaysia',                         flagUrl: 'https://cdn.countryflags.com/thumbs/malaysia/flag-800.png' },
    { tld: '.na', country: 'Namibia',                          flagUrl: 'https://cdn.countryflags.com/thumbs/namibia/flag-800.png' },
    { tld: '.pk', country: 'Pakistan',                         flagUrl: 'https://cdn.countryflags.com/thumbs/pakistan/flag-800.png' },
    { tld: '.hr', country: 'Croatia',                          flagUrl: 'https://cdn.countryflags.com/thumbs/croatia/flag-800.png' },
    { tld: '.eg', country: 'Egypt',                            flagUrl: 'https://cdn.countryflags.com/thumbs/egypt/flag-800.png' },
    { tld: '.gr', country: 'Greece',                           flagUrl: 'https://cdn.countryflags.com/thumbs/greece/flag-800.png' },
    { tld: '.mt', country: 'Malta',                            flagUrl: 'https://cdn.countryflags.com/thumbs/malta/flag-800.png' },
    { tld: '.ec', country: 'Ecuador',                          flagUrl: 'https://cdn.countryflags.com/thumbs/ecuador/flag-800.png' },
    { tld: '.ao', country: 'Angola',                           flagUrl: 'https://cdn.countryflags.com/thumbs/angola/flag-800.png' },
    { tld: '.tw', country: 'Taiwan',                           flagUrl: 'https://cdn.countryflags.com/thumbs/taiwan/flag-800.png' },
    { tld: '.td', country: 'Chad',                             flagUrl: 'https://cdn.countryflags.com/thumbs/chad/flag-800.png' },
    { tld: '.cl', country: 'Chile',                            flagUrl: 'https://cdn.countryflags.com/thumbs/chile/flag-800.png' },
    { tld: '.ug', country: 'Uganda',                           flagUrl: 'https://cdn.countryflags.com/thumbs/uganda/flag-800.png' },
    { tld: '.la', country: 'Laos',                             flagUrl: 'https://cdn.countryflags.com/thumbs/laos/flag-800.png' },
    { tld: '.gn', country: 'Guinea',                           flagUrl: 'https://cdn.countryflags.com/thumbs/guinea/flag-800.png' },
    { tld: '.mh', country: 'Marshall Islands',                 flagUrl: 'https://cdn.countryflags.com/thumbs/marshall-islands/flag-800.png' },
    { tld: '.bz', country: 'Belize',                           flagUrl: 'https://cdn.countryflags.com/thumbs/belize/flag-800.png' },
    { tld: '.ke', country: 'Kenya',                            flagUrl: 'https://cdn.countryflags.com/thumbs/kenya/flag-800.png' },
    { tld: '.ad', country: 'Andorra',                          flagUrl: 'https://cdn.countryflags.com/thumbs/andorra/flag-800.png' },
    { tld: '.bn', country: 'Brunei',                           flagUrl: 'https://cdn.countryflags.com/thumbs/brunei/flag-800.png' },
    { tld: '.tg', country: 'Togo',                             flagUrl: 'https://cdn.countryflags.com/thumbs/togo/flag-800.png' },
    { tld: '.qa', country: 'Qatar',                            flagUrl: 'https://cdn.countryflags.com/thumbs/qatar/flag-800.png' },
    { tld: '.ma', country: 'Morocco',                          flagUrl: 'https://cdn.countryflags.com/thumbs/morocco/flag-800.png' },
    { tld: '.uy', country: 'Uruguay',                          flagUrl: 'https://cdn.countryflags.com/thumbs/uruguay/flag-800.png' },
    { tld: '.ws', country: 'Samoa',                            flagUrl: 'https://cdn.countryflags.com/thumbs/samoa/flag-800.png' },
    { tld: '.ng', country: 'Nigeria',                          flagUrl: 'https://cdn.countryflags.com/thumbs/nigeria/flag-800.png' },
    { tld: '.ga', country: 'Gabon',                            flagUrl: 'https://cdn.countryflags.com/thumbs/gabon/flag-800.png' },
    { tld: '.th', country: 'Thailand',                         flagUrl: 'https://cdn.countryflags.com/thumbs/thailand/flag-800.png' },
    { tld: '.pe', country: 'Peru',                             flagUrl: 'https://cdn.countryflags.com/thumbs/peru/flag-800.png' },
    { tld: '.pl', country: 'Poland',                           flagUrl: 'https://cdn.countryflags.com/thumbs/poland/flag-800.png' },
    { tld: '.py', country: 'Paraguay',                         flagUrl: 'https://cdn.countryflags.com/thumbs/paraguay/flag-800.png' },
    { tld: '.jo', country: 'Jordan',                           flagUrl: 'https://cdn.countryflags.com/thumbs/jordan/flag-800.png' },
    { tld: '.gw', country: 'Guinea Bissau',                    flagUrl: 'https://cdn.countryflags.com/thumbs/guinea-bissau/flag-800.png' },
    { tld: '.bb', country: 'Barbados',                         flagUrl: 'https://cdn.countryflags.com/thumbs/barbados/flag-800.png' },
    { tld: '.lc', country: 'Saint Lucia',                      flagUrl: 'https://cdn.countryflags.com/thumbs/saint-lucia/flag-800.png' },
    { tld: '.mm', country: 'Myanmar',                          flagUrl: 'https://cdn.countryflags.com/thumbs/myanmar/flag-800.png' },
    { tld: '.zw', country: 'Zimbabwe',                         flagUrl: 'https://cdn.countryflags.com/thumbs/zimbabwe/flag-800.png' },
    { tld: '.gd', country: 'Grenada',                          flagUrl: 'https://cdn.countryflags.com/thumbs/grenada/flag-800.png' },
    { tld: '.bh', country: 'Bahrain',                          flagUrl: 'https://cdn.countryflags.com/thumbs/bahrain/flag-800.png' },
    { tld: '.kr', country: 'South Korea',                      flagUrl: 'https://cdn.countryflags.com/thumbs/south-korea/flag-800.png' },
    { tld: '.lu', country: 'Luxembourg',                       flagUrl: 'https://cdn.countryflags.com/thumbs/luxembourg/flag-800.png' },
    { tld: '.sy', country: 'Syria',                            flagUrl: 'https://cdn.countryflags.com/thumbs/syria/flag-800.png' },
    { tld: '.jm', country: 'Jamaica',                          flagUrl: 'https://cdn.countryflags.com/thumbs/jamaica/flag-800.png' },
    { tld: '.gy', country: 'Guyana',                           flagUrl: 'https://cdn.countryflags.com/thumbs/guyana/flag-800.png' },
    { tld: '.fj', country: 'Fiji',                             flagUrl: 'https://cdn.countryflags.com/thumbs/fiji/flag-800.png' },
    { tld: '.bs', country: 'Bahamas',                          flagUrl: 'https://cdn.countryflags.com/thumbs/bahamas/flag-800.png' },
    { tld: '.sd', country: 'Sudan',                            flagUrl: 'https://cdn.countryflags.com/thumbs/sudan/flag-800.png' },
    { tld: '.rw', country: 'Rwanda',                           flagUrl: 'https://cdn.countryflags.com/thumbs/rwanda/flag-800.png' },
    { tld: '.so', country: 'Somalia',                          flagUrl: 'https://cdn.countryflags.com/thumbs/somalia/flag-800.png' },
    { tld: '.ls', country: 'Lesotho',                          flagUrl: 'https://cdn.countryflags.com/thumbs/lesotho/flag-800.png' },
    { tld: '.dj', country: 'Djibouti',                         flagUrl: 'https://cdn.countryflags.com/thumbs/djibouti/flag-800.png' },
    { tld: '.si', country: 'Slovenia',                         flagUrl: 'https://cdn.countryflags.com/thumbs/slovenia/flag-800.png' },
    { tld: '.vc', country: 'Saint Vincent and the Grenadines', flagUrl: 'https://cdn.countryflags.com/thumbs/saint-vincent-and-the-grenadines/flag-800.png' },
    { tld: '.ne', country: 'Niger',                            flagUrl: 'https://cdn.countryflags.com/thumbs/niger/flag-800.png' },
    { tld: '.ve', country: 'Venezuela',                        flagUrl: 'https://cdn.countryflags.com/thumbs/venezuela/flag-800.png' },
    { tld: '.gt', country: 'Guatemala',                        flagUrl: 'https://cdn.countryflags.com/thumbs/guatemala/flag-800.png' },
    { tld: '.mw', country: 'Malawi',                           flagUrl: 'https://cdn.countryflags.com/thumbs/malawi/flag-800.png' },
    { tld: '.de', country: 'Germany',                          flagUrl: 'https://cdn.countryflags.com/thumbs/germany/flag-800.png' },
    { tld: '.do', country: 'Dominican Republic',               flagUrl: 'https://cdn.countryflags.com/thumbs/dominican-republic/flag-800.png' },
    { tld: '.sm', country: 'San Marino',                       flagUrl: 'https://cdn.countryflags.com/thumbs/san-marino/flag-800.png' },
    { tld: '.sv', country: 'El Salvador',                      flagUrl: 'https://cdn.countryflags.com/thumbs/el-salvador/flag-800.png' },
    { tld: '.mu', country: 'Mauritius',                        flagUrl: 'https://cdn.countryflags.com/thumbs/mauritius/flag-800.png' },
    { tld: '.tn', country: 'Tunisia',                          flagUrl: 'https://cdn.countryflags.com/thumbs/tunisia/flag-800.png' },
    { tld: '.kh', country: 'Cambodia',                         flagUrl: 'https://cdn.countryflags.com/thumbs/cambodia/flag-800.png' },
    { tld: '.se', country: 'Sweden',                           flagUrl: 'https://cdn.countryflags.com/thumbs/sweden/flag-800.png' },
    { tld: '.jp', country: 'Japan',                            flagUrl: 'https://cdn.countryflags.com/thumbs/japan/flag-800.png' },
    { tld: '.uk', country: 'United Kingdom',                   flagUrl: 'https://cdn.countryflags.com/thumbs/united-kingdom/flag-800.png' },
    { tld: '.va', country: 'Vatican City',                     flagUrl: 'https://cdn.countryflags.com/thumbs/vatican-city/flag-800.png' },
    { tld: '.lk', country: 'Sri Lanka',                        flagUrl: 'https://cdn.countryflags.com/thumbs/sri-lanka/flag-800.png' },
    { tld: '.cy', country: 'Cyprus',                           flagUrl: 'https://cdn.countryflags.com/thumbs/cyprus/flag-800.png' },
    { tld: '.lt', country: 'Lithuania',                        flagUrl: 'https://cdn.countryflags.com/thumbs/lithuania/flag-800.png' },
    { tld: '.ir', country: 'Iran',                             flagUrl: 'https://cdn.countryflags.com/thumbs/iran/flag-800.png' },
    { tld: '.ph', country: 'Philippines',                      flagUrl: 'https://cdn.countryflags.com/thumbs/philippines/flag-800.png' },
    { tld: '.sl', country: 'Sierra Leone',                     flagUrl: 'https://cdn.countryflags.com/thumbs/sierra-leone/flag-800.png' },
    { tld: '.is', country: 'Iceland',                          flagUrl: 'https://cdn.countryflags.com/thumbs/iceland/flag-800.png' },
    { tld: '.ly', country: 'Libya',                            flagUrl: 'https://cdn.countryflags.com/thumbs/libya/flag-800.png' },
    { tld: '.ca', country: 'Canada',                           flagUrl: 'https://cdn.countryflags.com/thumbs/canada/flag-800.png' },
    { tld: '.km', country: 'Comoros',                          flagUrl: 'https://cdn.countryflags.com/thumbs/comoros/flag-800.png' },
    { tld: '.ru', country: 'Russia',                           flagUrl: 'https://cdn.countryflags.com/thumbs/russia/flag-800.png' },
    { tld: '.dz', country: 'Algeria',                          flagUrl: 'https://cdn.countryflags.com/thumbs/algeria/flag-800.png' },
    { tld: '.ss', country: 'South Sudan',                      flagUrl: 'https://cdn.countryflags.com/thumbs/south-sudan/flag-800.png' },
    { tld: '.mz', country: 'Mozambique',                       flagUrl: 'https://cdn.countryflags.com/thumbs/mozambique/flag-800.png' },
    { tld: '.am', country: 'Armenia',                          flagUrl: 'https://cdn.countryflags.com/thumbs/armenia/flag-800.png' },
    { tld: '.fm', country: 'Micronesia',                       flagUrl: 'https://cdn.countryflags.com/thumbs/micronesia/flag-800.png' },
    { tld: '.ht', country: 'Haiti',                            flagUrl: 'https://cdn.countryflags.com/thumbs/haiti/flag-800.png' },
    { tld: '.hn', country: 'Honduras',                         flagUrl: 'https://cdn.countryflags.com/thumbs/honduras/flag-800.png' },
    { tld: '.tt', country: 'Trinidad and Tobago',              flagUrl: 'https://cdn.countryflags.com/thumbs/trinidad-and-tobago/flag-800.png' },
    { tld: '.az', country: 'Azerbaijan',                       flagUrl: 'https://cdn.countryflags.com/thumbs/azerbaijan/flag-800.png' },
    { tld: '.kg', country: 'Kyrgyzstan',                       flagUrl: 'https://cdn.countryflags.com/thumbs/kyrgyzstan/flag-800.png' },
    { tld: '.bg', country: 'Bulgaria',                         flagUrl: 'https://cdn.countryflags.com/thumbs/bulgaria/flag-800.png' },
    { tld: '.zm', country: 'Zambia',                           flagUrl: 'https://cdn.countryflags.com/thumbs/zambia/flag-800.png' },
    { tld: '.mk', country: 'North Macedonia',                  flagUrl: 'https://cdn.countryflags.com/thumbs/north-macedonia/flag-800.png' },
    { tld: '.ch', country: 'Switzerland',                      flagUrl: 'https://cdn.countryflags.com/thumbs/switzerland/flag-800.png' },
    { tld: '.om', country: 'Oman',                             flagUrl: 'https://cdn.countryflags.com/thumbs/oman/flag-800.png' },
    { tld: '.np', country: 'Nepal',                            flagUrl: 'https://cdn.countryflags.com/thumbs/nepal/flag-800.png' },
    { tld: '.pw', country: 'Palau',                            flagUrl: 'https://cdn.countryflags.com/thumbs/palau/flag-800.png' },
    { tld: '.cm', country: 'Cameroon',                         flagUrl: 'https://cdn.countryflags.com/thumbs/cameroon/flag-800.png' },
    { tld: '.tm', country: 'Turkmenistan',                     flagUrl: 'https://cdn.countryflags.com/thumbs/turkmenistan/flag-800.png' },
    { tld: '.to', country: 'Tonga',                            flagUrl: 'https://cdn.countryflags.com/thumbs/tonga/flag-800.png' },
    { tld: '.nz', country: 'New Zealand',                      flagUrl: 'https://cdn.countryflags.com/thumbs/new-zealand/flag-800.png' },
    { tld: '.af', country: 'Afghanistan',                      flagUrl: 'https://cdn.countryflags.com/thumbs/afghanistan/flag-800.png' },
    { tld: '.et', country: 'Ethiopia',                         flagUrl: 'https://cdn.countryflags.com/thumbs/ethiopia/flag-800.png' },
    { tld: '.li', country: 'Liechtenstein',                    flagUrl: 'https://cdn.countryflags.com/thumbs/liechtenstein/flag-800.png' },
    { tld: '.cn', country: 'China',                            flagUrl: 'https://cdn.countryflags.com/thumbs/china/flag-800.png' },
    { tld: '.er', country: 'Eritrea',                          flagUrl: 'https://cdn.countryflags.com/thumbs/eritrea/flag-800.png' },
    { tld: '.rs', country: 'Serbia',                           flagUrl: 'https://cdn.countryflags.com/thumbs/serbia/flag-800.png' },
    { tld: '.au', country: 'Australia',                        flagUrl: 'https://cdn.countryflags.com/thumbs/australia/flag-800.png' },
    { tld: '.tj', country: 'Tajikistan',                       flagUrl: 'https://cdn.countryflags.com/thumbs/tajikistan/flag-800.png' },
    { tld: '.bo', country: 'Bolivia',                          flagUrl: 'https://cdn.countryflags.com/thumbs/bolivia/flag-800.png' },
    { tld: '.kn', country: 'Saint Kitts and Nevis',            flagUrl: 'https://cdn.countryflags.com/thumbs/saint-kitts-and-nevis/flag-800.png' },
    { tld: '.pt', country: 'Portugal',                         flagUrl: 'https://cdn.countryflags.com/thumbs/portugal/flag-800.png' },
    { tld: '.ye', country: 'Yemen',                            flagUrl: 'https://cdn.countryflags.com/thumbs/yemen/flag-800.png' },
    { tld: '.mc', country: 'Monaco',                           flagUrl: 'https://cdn.countryflags.com/thumbs/monaco/flag-800.png' },
    { tld: '.ps', country: 'Palestine',                        flagUrl: 'https://cdn.countryflags.com/thumbs/palestine/flag-800.png' },
    { tld: '.br', country: 'Brazil',                           flagUrl: 'https://cdn.countryflags.com/thumbs/brazil/flag-800.png' },
    { tld: '.gm', country: 'The Gambia',                       flagUrl: 'https://cdn.countryflags.com/thumbs/gambia/flag-800.png' },
    { tld: '.sz', country: 'Eswatini',                         flagUrl: 'https://cdn.countryflags.com/thumbs/swaziland/flag-800.png' },
    { tld: '.cd', country: 'Democratic Republic of the Congo', flagUrl: 'https://cdn.countryflags.com/thumbs/congo-democratic-republic-of-the/flag-800.png' },
    { tld: '.us', country: 'United States',                    flagUrl: 'https://cdn.countryflags.com/thumbs/united-states-of-america/flag-800.png' },
    { tld: '.tl', country: 'Timor Leste',                      flagUrl: 'https://cdn.countryflags.com/thumbs/east-timor/flag-800.png' },
    { tld: '.tr', country: 'Türkiye',                          flagUrl: 'https://cdn.countryflags.com/thumbs/turkey/flag-800.png' },
    { tld: '.ci', country: 'Côte d\'Ivoire',                   flagUrl: 'https://cdn.countryflags.com/thumbs/cote-d-ivoire/flag-800.png' },
    { tld: '.cz', country: 'Czechia',                          flagUrl: 'https://cdn.countryflags.com/thumbs/czech-republic/flag-800.png' },
    { tld: '.cg', country: 'Republic of the Congo',            flagUrl: 'https://cdn.countryflags.com/thumbs/congo-republic-of-the/flag-800.png' },
    { tld: '.st', country: 'São Tomé and Príncipe',            flagUrl: 'https://cdn.countryflags.com/thumbs/sao-tome-and-principe/flag-800.png' },
    { tld: '.cv', country: 'Cabo Verde',                       flagUrl: 'https://cdn.countryflags.com/thumbs/cape-verde/flag-800.png' },
];

const ABBREVIATIONS = {
    'usa': 'United States',
    'uk': 'United Kingdom',
    'car': 'Central African Republic',
    'drc': 'Democratic Republic of the Congo',
    'the democratic republic of the congo': 'Democratic Republic of the Congo',
    'the democratic republic of congo': 'Democratic Republic of the Congo',
    'democratic republic of congo': 'Democratic Republic of the Congo',
    'republic of congo': 'Republic of the Congo',
    'skan': 'Saint Kitts and Nevis',
    'st kitts and nevis': 'Saint Kitts and Nevis',
    'st kitts': 'Saint Kitts and Nevis',
    'st vincent': 'Saint Vincent and the Grenadines',
    'st vincent and the grenadines': 'Saint Vincent and the Grenadines',
    'gambia': 'The Gambia',
    'the gambia': 'The Gambia',
    'bahamas': 'Bahamas',
    'the bahamas': 'Bahamas',
    'swaziland': 'Eswatini',
    'ivory coast': 'Côte d\'Ivoire',
    'cote divoire': 'Côte d\'Ivoire',
    'east timor': 'Timor Leste',
    'timor-leste': 'Timor Leste',
    'czech republic': 'Czechia',
    'czechia': 'Czechia',
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
    'the philippines': 'Philippines',
    'trinidad tobago': 'Trinidad and Tobago',
    'south korea': 'South Korea',
    'north korea': 'North Korea',
    'north macedonia': 'North Macedonia',
    'south sudan': 'South Sudan',
    'guinea bissau': 'Guinea Bissau',
    'equatorial guinea': 'Equatorial Guinea',
    'solomon islands': 'Solomon Islands',
    'marshall islands': 'Marshall Islands',
    'bosnia': 'Bosnia and Herzegovina',
    'bosnia herzegovina': 'Bosnia and Herzegovina',
    'antigua': 'Antigua and Barbuda',
    'trinidad': 'Trinidad and Tobago',
    'micronesia': 'Micronesia',
    'san marino': 'San Marino',
    'saint lucia': 'Saint Lucia',
    'sierra leone': 'Sierra Leone',
    'burkina faso': 'Burkina Faso',
};

// ============================================================
// CORE GAME
// ============================================================

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function initializeGame() {
    gameItems = shuffleArray(TLD_DATA).map(item => ({ ...item }));
    currentIndex = 0;
    correctAnswers = 0;
    hintUsedSet = new Set();
    hintVisible = false;
    startTime = null;
    pausedAt = null;
    totalPausedTime = 0;
    isPaused = false;
    pauseOverlay.classList.remove('active');
    pauseBtn.textContent = 'Pause';

    updateProgress();
    updateDisplay();
    countryInput.focus();
}

function updateProgress() {
    progressElement.textContent = `${correctAnswers}/${TLD_DATA.length}`;
}

function updateDisplay() {
    const cur = gameItems[currentIndex];
    if (cur) {
        currentTldEl.textContent = cur.tld;
        const curItem = document.querySelector('.tld-item.current');
        curItem.classList.toggle('solved', !!cur.guessed);
    }

    const prevIndex = currentIndex > 0 ? currentIndex - 1 : gameItems.length - 1;
    const prev = gameItems[prevIndex];
    if (prev) {
        prevTldEl.textContent = prev.tld;
        const prevItem = document.querySelector('.tld-item.prev');
        prevItem.classList.toggle('solved', !!prev.guessed);
        let nameEl = prevItem.querySelector('.country-label');
        if (prev.guessed) {
            if (!nameEl) {
                nameEl = document.createElement('div');
                nameEl.className = 'country-label';
                prevItem.appendChild(nameEl);
            }
            nameEl.textContent = prev.country;
        } else if (nameEl) {
            nameEl.remove();
        }
    }

    const nextIndex = currentIndex < gameItems.length - 1 ? currentIndex + 1 : 0;
    const next = gameItems[nextIndex];
    if (next) {
        nextTldEl.textContent = next.tld;
        const nextItem = document.querySelector('.tld-item.next');
        nextItem.classList.toggle('solved', !!next.guessed);
        let nameEl = nextItem.querySelector('.country-label');
        if (next.guessed) {
            if (!nameEl) {
                nameEl = document.createElement('div');
                nameEl.className = 'country-label';
                nextItem.appendChild(nameEl);
            }
            nameEl.textContent = next.country;
        } else if (nameEl) {
            nameEl.remove();
        }
    }

    // Reset hint on every navigation
    hintVisible = false;
    hintArea.classList.add('hidden');
    hintBtn.textContent = 'Show Flag Hint';

    updateInputState();
}

function updateInputState() {
    const cur = gameItems[currentIndex];
    if (cur && cur.guessed) {
        countryInput.disabled = true;
        countryInput.value = cur.country;
        countryInput.classList.add('solved');
        countryInput.placeholder = '✓ Solved';
        hintBtn.style.visibility = 'hidden';
        hintArea.classList.add('hidden');
    } else {
        countryInput.disabled = false;
        countryInput.value = '';
        countryInput.classList.remove('solved');
        countryInput.placeholder = 'Country name...';
        hintBtn.style.visibility = 'visible';
    }
}

// ============================================================
// HINT
// ============================================================

function toggleHint() {
    const cur = gameItems[currentIndex];
    if (!cur || cur.guessed) return;

    if (!hintVisible) {
        hintUsedSet.add(currentIndex);
        hintFlag.src = cur.flagUrl;
        hintArea.classList.remove('hidden');
        hintBtn.textContent = 'Hide Flag';
        hintVisible = true;
    } else {
        hintArea.classList.add('hidden');
        hintBtn.textContent = 'Show Flag Hint';
        hintVisible = false;
    }
}

// ============================================================
// TIMER
// ============================================================

function startTimer() {
    if (startTime) return;
    startTime = Date.now();
    totalPausedTime = 0;

    timerElement.classList.add('timer-flash');
    setTimeout(() => timerElement.classList.remove('timer-flash'), 600);

    function tick() {
        if (!startTime) return;
        if (isPaused) { requestAnimationFrame(tick); return; }
        const elapsed = Date.now() - startTime - totalPausedTime;
        const m = Math.floor(elapsed / 60000);
        const s = Math.floor((elapsed % 60000) / 1000);
        timerElement.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        requestAnimationFrame(tick);
    }
    tick();
}

function togglePause() {
    if (!startTime) return;
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

// ============================================================
// ANSWER CHECKING
// ============================================================

function normalizeAnswer(answer) {
    return answer.toLowerCase().trim().replace(/[^a-z\s]/g, '');
}

function checkAnswer() {
    const userAnswer = normalizeAnswer(countryInput.value);
    const correctAnswer = normalizeAnswer(gameItems[currentIndex].country);
    if (userAnswer === correctAnswer) return true;
    const expanded = ABBREVIATIONS[userAnswer];
    if (expanded && normalizeAnswer(expanded) === correctAnswer) return true;
    return false;
}

function handleCorrectAnswer() {
    const answeredItem = gameItems[currentIndex];
    correctAnswers++;
    gameItems[currentIndex].guessed = true;

    countryInput.value = '';
    countryInput.disabled = false;
    countryInput.classList.remove('solved');
    countryInput.placeholder = 'Country name...';

    updateProgress();

    if (gameItems.every(item => item.guessed)) {
        feedback.textContent = `Correct! ${answeredItem.country}`;
        feedback.className = 'feedback correct';
        setTimeout(() => endGame(), 800);
        return;
    }

    navigateItems('next');
    countryInput.focus();

    feedback.textContent = `Correct! ${answeredItem.country}`;
    feedback.className = 'feedback correct';
    setTimeout(() => {
        feedback.textContent = '';
        feedback.className = 'feedback';
    }, 800);
}

function handleIncorrectAnswer() {
    feedback.textContent = 'Try again...';
    feedback.className = 'feedback incorrect';
    setTimeout(() => {
        feedback.textContent = '';
        feedback.className = 'feedback';
    }, 1000);
}

// ============================================================
// NAVIGATION
// ============================================================

function findNextUnsolvedItem(direction) {
    let idx = currentIndex;
    let attempts = 0;
    do {
        idx = direction === 'next'
            ? (idx < gameItems.length - 1 ? idx + 1 : 0)
            : (idx > 0 ? idx - 1 : gameItems.length - 1);
        attempts++;
    } while (gameItems[idx].guessed && attempts < gameItems.length);
    return idx;
}

function slideItems(direction) {
    currentIndex = findNextUnsolvedItem(direction);
    updateDisplay();

    const container = document.querySelector('.tld-container');
    container.classList.add(`slide-${direction === 'next' ? 'left' : 'right'}`);
    setTimeout(() => container.classList.remove('slide-left', 'slide-right'), 200);
}

function navigateItems(direction) {
    slideItems(direction);
    feedback.textContent = '';
    feedback.className = 'feedback';
}

// ============================================================
// END GAME / RESULTS
// ============================================================

function endGame() {
    let totalTime = 0;
    if (!startTime) {
        document.getElementById('final-time').textContent = '00:00';
    } else {
        totalTime = Date.now() - startTime - totalPausedTime;
        const m = Math.floor(totalTime / 60000);
        const s = Math.floor((totalTime % 60000) / 1000);
        document.getElementById('final-time').textContent =
            `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    document.getElementById('hints-count').textContent = hintUsedSet.size;

    const total = TLD_DATA.length;
    const successRate = Math.round((correctAnswers / total) * 100);
    document.getElementById('correct-count').textContent = `${correctAnswers}/${total}`;
    document.getElementById('success-rate').textContent = `${successRate}%`;

    if (successRate === 100) celebrate();

    const isNewRecord = savePersonalBest(totalTime, successRate, correctAnswers);

    // Missed items
    const missedList    = document.getElementById('missed-list');
    const missedSection = document.querySelector('.missed-flags');
    const missedCount   = document.getElementById('missed-count');
    missedList.innerHTML = '';

    const allMissed = gameItems.filter(item => !item.guessed);
    if (allMissed.length > 0) {
        missedSection.style.display = 'block';
        missedCount.textContent = `(${allMissed.length})`;
        allMissed.forEach(item => {
            const el = document.createElement('div');
            el.className = 'missed-item';
            el.innerHTML = `
                <code class="missed-tld">${item.tld}</code>
                <img src="${item.flagUrl}" alt="${item.country}" class="missed-flag-img">
                <span class="missed-country">${item.country}</span>
            `;
            missedList.appendChild(el);
        });
    } else {
        missedSection.style.display = 'none';
        missedCount.textContent = '';
    }

    displayPersonalBest(isNewRecord);

    gameScreen.classList.remove('active');
    resultsScreen.classList.add('active');
    progressElement.style.display = 'none';
    document.querySelector('.top-right-section').style.display = 'none';

    startTime = null;
    isPaused = false;
    pauseOverlay.classList.remove('active');
    pauseBtn.textContent = 'Pause';
}

function savePersonalBest(time, successRate, count) {
    if (successRate === 0) return false;
    let isNewRecord = false;
    const total = TLD_DATA.length;

    if (successRate === 100) {
        const pb = { time, successRate, count, type: 'time', date: new Date().toISOString() };
        const existing = localStorage.getItem('tldGameTimePB');
        if (!existing || JSON.parse(existing).time > time) {
            if (existing) localStorage.setItem('tldGamePreviousTimePB', existing);
            localStorage.setItem('tldGameTimePB', JSON.stringify(pb));
            isNewRecord = true;
        }
    } else {
        const pb = { count, successRate, time, type: 'count', date: new Date().toISOString() };
        const existing = localStorage.getItem('tldGameCountPB');
        if (!existing || JSON.parse(existing).count < count) {
            if (existing) localStorage.setItem('tldGamePreviousCountPB', existing);
            localStorage.setItem('tldGameCountPB', JSON.stringify(pb));
            isNewRecord = true;
        }
    }
    return isNewRecord;
}

function displayPersonalBest(isNewRecord = false) {
    const timePB  = localStorage.getItem('tldGameTimePB');
    const countPB = localStorage.getItem('tldGameCountPB');
    const prevTimePB  = localStorage.getItem('tldGamePreviousTimePB');
    const prevCountPB = localStorage.getItem('tldGamePreviousCountPB');

    const finalStats = document.querySelector('.final-stats');
    let pbEl = document.getElementById('personal-best');
    if (!pbEl) {
        pbEl = document.createElement('div');
        pbEl.id = 'personal-best';
        pbEl.className = 'stat';
        finalStats.appendChild(pbEl);
    }

    if (!timePB && !countPB) { pbEl.style.display = 'none'; return; }

    const total = TLD_DATA.length;
    let content = '<span class="label">Personal Best:</span><span>';

    const isFirst100 = timePB && isNewRecord && !prevTimePB && countPB && JSON.parse(countPB).successRate < 100;

    if (timePB) {
        const pb = JSON.parse(timePB);
        const m = Math.floor(pb.time / 60000);
        const s = Math.floor((pb.time % 60000) / 1000);
        const pbStr = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

        if (isNewRecord && pb.type === 'time' && prevTimePB) {
            const prev = JSON.parse(prevTimePB);
            const pm = Math.floor(prev.time / 60000);
            const ps = Math.floor((prev.time % 60000) / 1000);
            const prevStr = `${String(pm).padStart(2,'0')}:${String(ps).padStart(2,'0')}`;
            content += `<span class="previous-pb">${prevStr} (100%)</span> <span class="gradient-text">${pbStr} (100%) NEW BEST!</span>`;
        } else if (isFirst100) {
            content += `<span class="gradient-text">${pbStr} (100%) NEW BEST!</span>`;
        } else {
            content += `${pbStr} (100%)`;
        }
    }

    if (countPB && !isFirst100) {
        const pb = JSON.parse(countPB);
        if (timePB) content += ' / ';
        if (isNewRecord && pb.type === 'count' && prevCountPB) {
            const prev = JSON.parse(prevCountPB);
            content += `<span class="previous-pb">${prev.count}/${total}</span> <span class="gradient-text">${pb.count}/${total} NEW BEST!</span>`;
        } else {
            content += `${pb.count}/${total} (${pb.successRate}%)`;
        }
    }

    content += '</span>';
    pbEl.style.display = 'flex';
    pbEl.innerHTML = content;
}

// ============================================================
// CELEBRATION
// ============================================================

let confettiInterval;

function celebrate() {
    document.body.classList.add('celebration');
    if (confettiInterval) clearInterval(confettiInterval);
    confettiInterval = setInterval(createConfettiBurst, 200);
}

function createConfettiBurst() {
    const colors = ['#ff0000','#ff8000','#ffff00','#80ff00','#00ff00','#00ffff','#0080ff','#8000ff','#ff00ff'];
    for (let i = 0; i < 15; i++) {
        const el = document.createElement('div');
        el.className = 'confetti';
        el.style.left = Math.random() * 100 + 'vw';
        el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        el.style.animationDelay    = Math.random() * 0.5 + 's';
        el.style.animationDuration = (Math.random() * 2 + 3) + 's';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 6000);
    }
}

function stopCelebration() {
    document.body.classList.remove('celebration');
    if (confettiInterval) { clearInterval(confettiInterval); confettiInterval = null; }
    document.querySelectorAll('.confetti').forEach(el => el.remove());
}

// ============================================================
// RESTART
// ============================================================

function restartGame() {
    resultsScreen.classList.remove('active');
    gameScreen.classList.add('active');
    document.querySelector('.top-right-section').style.display = 'flex';
    progressElement.style.display = 'block';
    feedback.textContent = '';
    feedback.className = 'feedback';
    countryInput.value = '';
    timerElement.textContent = '00:00';
    stopCelebration();
    initializeGame();
}

// ============================================================
// EVENT LISTENERS
// ============================================================

countryInput.addEventListener('input', () => {
    startTimer();
    if (countryInput.value.trim() && checkAnswer()) handleCorrectAnswer();
});

countryInput.addEventListener('keypress', (e) => {
    startTimer();
    if (e.key === 'Enter' && countryInput.value.trim()) {
        if (!checkAnswer()) handleIncorrectAnswer();
    }
});

prevBtn.addEventListener('click', () => navigateItems('prev'));
nextBtn.addEventListener('click', () => navigateItems('next'));
giveUpBtn.addEventListener('click', endGame);
pauseBtn.addEventListener('click', togglePause);
playAgainBtn.addEventListener('click', restartGame);
hintBtn.addEventListener('click', () => { startTimer(); toggleHint(); });

document.addEventListener('keydown', (e) => {
    if (!gameScreen.classList.contains('active')) return;

    if (e.key === 'Escape' && startTime) {
        e.preventDefault();
        togglePause();
        return;
    }

    if (!isPaused) {
        const canNav = document.activeElement !== countryInput || e.shiftKey;
        if (canNav && e.key === 'ArrowLeft')  { e.preventDefault(); navigateItems('prev'); }
        if (canNav && e.key === 'ArrowRight') { e.preventDefault(); navigateItems('next'); }
    }
});

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    initializeGame();
});
