/**
 * Demo seed. Business identity fields marked "verify" come from public
 * directories (Telecontact / Charika) and must be confirmed by the client.
 * Fleet, prices, extras, reviews and articles are realistic DEMO content
 * (based on Casablanca market ranges, Sept 2026) to be replaced in the admin.
 */

export const seedSettings = {
  id: 1,
  name: 'Diab Car',
  legalName: 'DIAB CAR SARL',
  tagline: { fr: 'Location de voitures à Casablanca', en: 'Car rental in Casablanca', ar: 'كراء السيارات في الدار البيضاء', es: 'Alquiler de coches en Casablanca' },
  phonePrimary: '+212659775582', // verify (Telecontact mobile)
  phoneSecondary: '+212625236229', // verify (Telecontact mobile)
  phoneLandline: '+212522260305', // verify (Charika)
  whatsapp: '+212659775582', // verify which number is WhatsApp-enabled
  email: 'contact@diabcar.ma', // verify
  addressLine: '356 Boulevard Zerktouni', // Telecontact + Charika
  city: 'Casablanca',
  postalCode: '20000', // verify
  region: 'Casablanca-Settat',
  country: 'MA',
  lat: 33.5883, // approximate — set exact pin from Google Business Profile
  lng: -7.6314,
  googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=356+Boulevard+Zerktouni+Casablanca',
  facebookUrl: 'https://www.facebook.com/people/Diab-car/100063808380188/',
  instagramUrl: '',
  tiktokUrl: '',
  hours: [
    { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], opens: '08:00', closes: '20:00' },
    { days: ['sun'], opens: '09:00', closes: '18:00' },
  ],
  airportService24h: true,
  rc: '285663', // Telecontact
  ice: '000032763000039', // Telecontact
  capitalMad: 1200000, // Charika/Telecontact
  foundedYear: 2013, // Telecontact
  eurRate: 10.8, // MAD per EUR, indicative — update in admin
  responseTime: { fr: 'Réponse WhatsApp en moins de 10 min (08h–23h)', en: 'WhatsApp reply within 10 min (8am–11pm)', ar: 'رد على واتساب في أقل من 10 دقائق (08:00–23:00)', es: 'Respuesta por WhatsApp en menos de 10 min (8h–23h)' },
  airportDeliveryFee: 0,
  cityDeliveryFee: 0,
  oneWayFee: 0,
  minAge: 21,
  premiumMinAge: 25,
  minLicenseYears: 1,
  fuelPolicy: 'full-to-full',
  freeCancellationHours: 24,
  depositReleaseDays: 7,
  pricingTiers: [
    { minDays: 7, discountPct: 10 },
    { minDays: 15, discountPct: 15 },
    { minDays: 30, discountPct: 25 },
  ],
  monthlyFrom: { economy: 6500, suv: 9500, premium: 19000 },
  gbpUrl: '',
  gaId: '',
  indexNowKey: '',
  updatedAt: '2026-09-01T09:00:00.000Z',
};

const d = (fr, en, ar, es) => ({ fr, en, ar, es });

export const seedVehicles = [
  {
    id: 'v-logan', slug: 'dacia-logan', brand: 'Dacia', model: 'Logan', year: 2024, category: 'economy',
    transmission: 'manual', fuel: 'diesel', seats: 5, doors: 4, luggage: 2, ac: true,
    pricePerDay: 250, deposit: 3000, mileageLimit: null, minAge: 21, image: 'citadine', images: [],
    features: ['ac', 'bluetooth', 'usb', 'isofix'], published: true, featured: false, sortOrder: 10,
    rating: 0, reviewCount: 0,
    description: d(
      'La berline la plus économique de Casablanca : grand coffre, 5 places, consommation réduite. Idéale pour les séjours en famille et les trajets vers Rabat ou Marrakech.',
      'The most economical sedan in Casablanca: large boot, 5 seats, low fuel consumption. Ideal for family stays and trips to Rabat or Marrakech.',
      'أكثر سيارة اقتصادية في الدار البيضاء: صندوق واسع، 5 مقاعد، استهلاك منخفض للوقود. مثالية للإقامات العائلية والرحلات إلى الرباط أو مراكش.',
      'La berlina más económica de Casablanca: maletero amplio, 5 plazas, bajo consumo. Ideal para estancias en familia y viajes a Rabat o Marrakech.',
    ),
  },
  {
    id: 'v-clio', slug: 'renault-clio-5', brand: 'Renault', model: 'Clio 5', year: 2024, category: 'economy',
    transmission: 'manual', fuel: 'petrol', seats: 5, doors: 5, luggage: 2, ac: true,
    pricePerDay: 280, deposit: 3000, mileageLimit: null, minAge: 21, image: 'citadine', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'usb', 'parking_sensors'], published: true, featured: true, sortOrder: 20,
    rating: 0, reviewCount: 0,
    description: d(
      'Citadine moderne et agile, parfaite pour circuler à Casablanca. Écran tactile, Apple CarPlay / Android Auto, capteurs de stationnement.',
      'A modern, agile city car, perfect for Casablanca traffic. Touchscreen, Apple CarPlay / Android Auto, parking sensors.',
      'سيارة مدينة عصرية ورشيقة، مثالية للتنقل في الدار البيضاء. شاشة لمس، Apple CarPlay / Android Auto، حساسات ركن.',
      'Utilitario moderno y ágil, perfecto para moverse por Casablanca. Pantalla táctil, Apple CarPlay / Android Auto, sensores de aparcamiento.',
    ),
  },
  {
    id: 'v-i20', slug: 'hyundai-i20', brand: 'Hyundai', model: 'i20', year: 2024, category: 'economy',
    transmission: 'automatic', fuel: 'petrol', seats: 5, doors: 5, luggage: 2, ac: true,
    pricePerDay: 320, deposit: 3000, mileageLimit: null, minAge: 21, image: 'citadine', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'camera', 'usb'], published: true, featured: false, sortOrder: 30,
    rating: 0, reviewCount: 0,
    description: d(
      'Boîte automatique, caméra de recul et faible consommation : la citadine la plus confortable de notre gamme économique.',
      'Automatic gearbox, reversing camera and low consumption: the most comfortable city car in our economy range.',
      'ناقل حركة أوتوماتيكي، كاميرا خلفية واستهلاك منخفض: أكثر سيارة مدينة راحة في فئتنا الاقتصادية.',
      'Cambio automático, cámara trasera y bajo consumo: el utilitario más cómodo de nuestra gama económica.',
    ),
  },
  {
    id: 'v-208', slug: 'peugeot-208', brand: 'Peugeot', model: '208', year: 2024, category: 'compact',
    transmission: 'automatic', fuel: 'petrol', seats: 5, doors: 5, luggage: 2, ac: true,
    pricePerDay: 340, deposit: 4000, mileageLimit: null, minAge: 21, image: 'citadine', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'camera', 'cruise', 'led'], published: true, featured: false, sortOrder: 40,
    rating: 0, reviewCount: 0,
    description: d(
      'Design premium, i-Cockpit, boîte automatique EAT8. La compacte qui fait bonne figure devant un hôtel comme sur l’autoroute.',
      'Premium design, i-Cockpit, EAT8 automatic gearbox. The compact that looks the part at a hotel and on the motorway.',
      'تصميم فاخر، i-Cockpit، ناقل أوتوماتيكي EAT8. سيارة مدمجة أنيقة أمام الفندق وعلى الطريق السيار.',
      'Diseño premium, i-Cockpit, cambio automático EAT8. El compacto que luce tanto frente a un hotel como en la autopista.',
    ),
  },
  {
    id: 'v-duster', slug: 'dacia-duster', brand: 'Dacia', model: 'Duster', year: 2024, category: 'suv',
    transmission: 'manual', fuel: 'diesel', seats: 5, doors: 5, luggage: 3, ac: true,
    pricePerDay: 400, deposit: 5000, mileageLimit: null, minAge: 21, image: 'suv', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'camera', 'cruise', 'usb'], published: true, featured: true, sortOrder: 50,
    rating: 0, reviewCount: 0,
    description: d(
      'Le SUV le plus demandé au Maroc : garde au sol élevée, coffre de 475 L, diesel sobre. Parfait pour l’Atlas, Essaouira ou les routes secondaires.',
      'Morocco’s most requested SUV: high ground clearance, 475 L boot, frugal diesel. Perfect for the Atlas, Essaouira or secondary roads.',
      'أكثر سيارة دفع رباعي طلباً في المغرب: ارتفاع عالٍ عن الأرض، صندوق 475 لتر، ديزل اقتصادي. مثالية للأطلس والصويرة والطرق الثانوية.',
      'El SUV más solicitado en Marruecos: gran altura libre, maletero de 475 L, diésel sobrio. Perfecto para el Atlas, Essaouira o carreteras secundarias.',
    ),
  },
  {
    id: 'v-tucson', slug: 'hyundai-tucson', brand: 'Hyundai', model: 'Tucson', year: 2024, category: 'suv',
    transmission: 'automatic', fuel: 'diesel', seats: 5, doors: 5, luggage: 3, ac: true,
    pricePerDay: 550, deposit: 6000, mileageLimit: null, minAge: 23, image: 'suv-premium', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'camera', 'cruise', 'led', 'parking_sensors', 'isofix'], published: true, featured: true, sortOrder: 60,
    rating: 0, reviewCount: 0,
    description: d(
      'SUV familial automatique, intérieur spacieux, aides à la conduite complètes. Le choix des familles MRE pour l’été.',
      'Automatic family SUV with a spacious interior and full driver-assistance. The summer favourite of Moroccan families visiting from abroad.',
      'سيارة عائلية أوتوماتيكية بمقصورة واسعة ومساعدات قيادة كاملة. الخيار المفضل للعائلات المغربية القادمة من الخارج في الصيف.',
      'SUV familiar automático, interior espacioso y asistencias a la conducción completas. La elección de las familias marroquíes residentes en el extranjero en verano.',
    ),
  },
  {
    id: 'v-troc', slug: 'volkswagen-t-roc', brand: 'Volkswagen', model: 'T-Roc', year: 2023, category: 'suv',
    transmission: 'automatic', fuel: 'petrol', seats: 5, doors: 5, luggage: 2, ac: true,
    pricePerDay: 500, deposit: 6000, mileageLimit: null, minAge: 23, image: 'suv', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'camera', 'cruise', 'led'], published: true, featured: false, sortOrder: 70,
    rating: 0, reviewCount: 0,
    description: d(
      'SUV compact au style affirmé, boîte DSG et finition allemande. Confortable en ville comme sur l’A7 vers Marrakech.',
      'A compact SUV with bold styling, DSG gearbox and German build quality. Comfortable in town and on the A7 to Marrakech.',
      'سيارة SUV مدمجة بتصميم جريء، ناقل DSG وجودة تصنيع ألمانية. مريحة في المدينة وعلى الطريق السيار A7 نحو مراكش.',
      'SUV compacto de estilo marcado, cambio DSG y acabado alemán. Cómodo en ciudad y en la A7 hacia Marrakech.',
    ),
  },
  {
    id: 'v-corolla', slug: 'toyota-corolla-hybride', brand: 'Toyota', model: 'Corolla Hybride', year: 2024, category: 'sedan',
    transmission: 'automatic', fuel: 'hybrid', seats: 5, doors: 4, luggage: 3, ac: true,
    pricePerDay: 450, deposit: 5000, mileageLimit: null, minAge: 23, image: 'berline', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'camera', 'cruise', 'led', 'hybrid'], published: true, featured: true, sortOrder: 80,
    rating: 0, reviewCount: 0,
    description: d(
      'Berline hybride silencieuse, 4 L/100 km en ville. La voiture idéale pour les déplacements professionnels à Casablanca et Rabat.',
      'A quiet hybrid sedan, 4 L/100 km in town. The ideal car for business travel between Casablanca and Rabat.',
      'سيارة سيدان هجينة هادئة، 4 لتر/100 كم في المدينة. السيارة المثالية لرحلات العمل بين الدار البيضاء والرباط.',
      'Berlina híbrida silenciosa, 4 L/100 km en ciudad. El coche ideal para desplazamientos de negocios entre Casablanca y Rabat.',
    ),
  },
  {
    id: 'v-classe-c', slug: 'mercedes-classe-c', brand: 'Mercedes-Benz', model: 'Classe C', year: 2023, category: 'premium',
    transmission: 'automatic', fuel: 'diesel', seats: 5, doors: 4, luggage: 3, ac: true,
    pricePerDay: 1100, deposit: 12000, mileageLimit: 250, minAge: 25, image: 'coupe', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'camera', 'cruise', 'led', 'leather', 'parking_sensors', 'sunroof'], published: true, featured: true, sortOrder: 90,
    rating: 0, reviewCount: 0,
    description: d(
      'Berline premium, cuir, écran MBUX et boîte 9G-Tronic. Pour les rendez-vous d’affaires, les mariages et les arrivées remarquées.',
      'Premium sedan with leather, MBUX display and 9G-Tronic gearbox. For business meetings, weddings and arrivals that get noticed.',
      'سيدان فاخرة بجلد وشاشة MBUX وناقل 9G-Tronic. لاجتماعات الأعمال والأعراس والوصول بأناقة.',
      'Berlina premium con cuero, pantalla MBUX y cambio 9G-Tronic. Para reuniones de negocios, bodas y llegadas que no pasan desapercibidas.',
    ),
  },
  {
    id: 'v-serie-3', slug: 'bmw-serie-3', brand: 'BMW', model: 'Série 3', year: 2023, category: 'premium',
    transmission: 'automatic', fuel: 'diesel', seats: 5, doors: 4, luggage: 3, ac: true,
    pricePerDay: 1000, deposit: 12000, mileageLimit: 250, minAge: 25, image: 'coupe', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'camera', 'cruise', 'led', 'leather', 'parking_sensors'], published: true, featured: false, sortOrder: 100,
    rating: 0, reviewCount: 0,
    description: d(
      'Le plaisir de conduite BMW avec la sobriété du diesel. Sellerie cuir, navigation, aide au stationnement.',
      'BMW driving pleasure with diesel economy. Leather seats, navigation, parking assistance.',
      'متعة القيادة من BMW مع اقتصاد الديزل. مقاعد جلدية، ملاحة، مساعد ركن.',
      'El placer de conducir BMW con la sobriedad del diésel. Tapicería de cuero, navegación, asistente de aparcamiento.',
    ),
  },
  {
    id: 'v-evoque', slug: 'range-rover-evoque', brand: 'Land Rover', model: 'Range Rover Evoque', year: 2023, category: 'premium',
    transmission: 'automatic', fuel: 'diesel', seats: 5, doors: 5, luggage: 3, ac: true,
    pricePerDay: 900, deposit: 12000, mileageLimit: 250, minAge: 25, image: 'suv-premium', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'camera', 'cruise', 'led', 'leather', '4wd', 'sunroof'], published: true, featured: true, sortOrder: 110,
    rating: 0, reviewCount: 0,
    description: d(
      'SUV premium 4x4 au design iconique. Toit panoramique, cuir, caméras 360°. L’équilibre parfait entre prestige et polyvalence.',
      'An iconic premium 4x4 SUV. Panoramic roof, leather, 360° cameras. The perfect balance of prestige and versatility.',
      'سيارة دفع رباعي فاخرة بتصميم أيقوني. سقف بانورامي، جلد، كاميرات 360°. توازن مثالي بين الفخامة وتعدد الاستخدامات.',
      'SUV premium 4x4 de diseño icónico. Techo panorámico, cuero, cámaras 360°. El equilibrio perfecto entre prestigio y versatilidad.',
    ),
  },
  {
    id: 'v-q8', slug: 'audi-q8', brand: 'Audi', model: 'Q8', year: 2023, category: 'luxury',
    transmission: 'automatic', fuel: 'diesel', seats: 5, doors: 5, luggage: 4, ac: true,
    pricePerDay: 1900, deposit: 20000, mileageLimit: 200, minAge: 25, image: 'suv-premium', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'camera', 'cruise', 'led', 'leather', '4wd', 'sunroof', 'massage'], published: true, featured: true, sortOrder: 120,
    rating: 0, reviewCount: 0,
    description: d(
      'SUV coupé de luxe, quattro, Matrix LED, intérieur Valcona. Pour les séjours d’exception, les tournages et les délégations.',
      'Luxury coupé-SUV, quattro, Matrix LED, Valcona leather. For exceptional stays, film shoots and delegations.',
      'سيارة SUV كوبيه فاخرة، quattro، Matrix LED، جلد Valcona. للإقامات الاستثنائية والتصوير والوفود.',
      'SUV coupé de lujo, quattro, Matrix LED, cuero Valcona. Para estancias excepcionales, rodajes y delegaciones.',
    ),
  },
  {
    id: 'v-cayenne', slug: 'porsche-cayenne', brand: 'Porsche', model: 'Cayenne', year: 2022, category: 'luxury',
    transmission: 'automatic', fuel: 'petrol', seats: 5, doors: 5, luggage: 3, ac: true,
    pricePerDay: 2800, deposit: 25000, mileageLimit: 200, minAge: 28, image: 'suv-premium', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'camera', 'cruise', 'led', 'leather', '4wd', 'sunroof', 'sport'], published: true, featured: false, sortOrder: 130,
    rating: 0, reviewCount: 0,
    description: d(
      'Le SUV sportif de référence. V6 turbo, châssis sport, cuir intégral. Livré avec chauffeur sur demande.',
      'The benchmark sports SUV. Turbo V6, sport chassis, full leather. Available with a driver on request.',
      'مرجع سيارات الدفع الرباعي الرياضية. محرك V6 توربو، هيكل رياضي، جلد كامل. متوفرة مع سائق عند الطلب.',
      'El SUV deportivo de referencia. V6 turbo, chasis deportivo, cuero integral. Disponible con conductor bajo petición.',
    ),
  },
  {
    id: 'v-classe-v', slug: 'mercedes-classe-v', brand: 'Mercedes-Benz', model: 'Classe V', year: 2023, category: 'van',
    transmission: 'automatic', fuel: 'diesel', seats: 7, doors: 5, luggage: 6, ac: true,
    pricePerDay: 1200, deposit: 12000, mileageLimit: 250, minAge: 25, image: 'van', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'camera', 'cruise', 'led', 'leather', 'isofix'], published: true, featured: false, sortOrder: 140,
    rating: 0, reviewCount: 0,
    description: d(
      'Van premium 7 places, sièges cuir face à face, climatisation tri-zone. Idéal pour les familles nombreuses et les transferts VIP.',
      'Premium 7-seat van, face-to-face leather seats, tri-zone climate control. Ideal for large families and VIP transfers.',
      'فان فاخر بسبعة مقاعد جلدية متقابلة وتكييف ثلاثي المناطق. مثالي للعائلات الكبيرة والنقل الخاص للشخصيات المهمة.',
      'Monovolumen premium de 7 plazas, asientos de cuero enfrentados, climatizador tri-zona. Ideal para familias numerosas y traslados VIP.',
    ),
  },
  {
    id: 'v-staria', slug: 'hyundai-staria', brand: 'Hyundai', model: 'Staria', year: 2023, category: 'van',
    transmission: 'automatic', fuel: 'diesel', seats: 9, doors: 5, luggage: 6, ac: true,
    pricePerDay: 1000, deposit: 10000, mileageLimit: null, minAge: 25, image: 'van', images: [],
    features: ['ac', 'bluetooth', 'apple_carplay', 'camera', 'cruise', 'led', 'isofix'], published: true, featured: false, sortOrder: 150,
    rating: 0, reviewCount: 0,
    description: d(
      'Minibus 9 places au confort de berline. Pour les groupes, les mariages et les excursions vers Marrakech ou Chefchaouen.',
      'A 9-seat minibus with sedan-level comfort. For groups, weddings and excursions to Marrakech or Chefchaouen.',
      'حافلة صغيرة بـ 9 مقاعد براحة سيارة سيدان. للمجموعات والأعراس والرحلات إلى مراكش أو شفشاون.',
      'Minibús de 9 plazas con el confort de una berlina. Para grupos, bodas y excursiones a Marrakech o Chefchaouen.',
    ),
  },
];

export const seedSeasons = [
  { id: 's-summer', name: 'Été / MRE', startDate: '2027-06-15', endDate: '2027-09-10', multiplier: 1.35, active: true },
  { id: 's-eid-fitr', name: 'Aïd al-Fitr', startDate: '2027-03-05', endDate: '2027-03-14', multiplier: 1.2, active: true },
  { id: 's-eid-adha', name: 'Aïd al-Adha', startDate: '2027-05-13', endDate: '2027-05-22', multiplier: 1.2, active: true },
  { id: 's-winter', name: 'Fêtes de fin d’année', startDate: '2026-12-18', endDate: '2027-01-04', multiplier: 1.2, active: true },
];

export const seedExtras = [
  { id: 'x-cdw', key: 'full_insurance', type: 'per_day', price: 80, active: true, name: d('Assurance tous risques sans franchise', 'Full insurance, zero excess', 'تأمين شامل بدون تحمل', 'Seguro a todo riesgo sin franquicia') },
  { id: 'x-driver', key: 'additional_driver', type: 'flat', price: 150, active: true, name: d('Conducteur additionnel', 'Additional driver', 'سائق إضافي', 'Conductor adicional') },
  { id: 'x-seat', key: 'child_seat', type: 'per_day', price: 30, active: true, name: d('Siège bébé / enfant', 'Child seat', 'مقعد أطفال', 'Silla infantil') },
  { id: 'x-gps', key: 'gps', type: 'per_day', price: 30, active: true, name: d('GPS', 'GPS', 'GPS', 'GPS') },
  { id: 'x-wifi', key: 'wifi', type: 'per_day', price: 40, active: true, name: d('Wi-Fi 4G embarqué', 'In-car 4G Wi-Fi', 'واي فاي 4G في السيارة', 'Wi-Fi 4G a bordo') },
  { id: 'x-chauffeur', key: 'chauffeur', type: 'per_day', price: 400, active: true, name: d('Chauffeur (8 h / jour)', 'Driver (8 h / day)', 'سائق (8 ساعات/يوم)', 'Conductor (8 h/día)') },
];

export const seedLocations = [
  { id: 'l-agency', key: 'agency', type: 'agency', fee: 0, active: true, name: d('Agence — 356 Bd Zerktouni', 'Agency — 356 Bd Zerktouni', 'الوكالة — 356 شارع الزرقطوني', 'Agencia — 356 Bd Zerktouni') },
  { id: 'l-cmn', key: 'airport', type: 'airport', fee: 0, active: true, name: d('Aéroport Mohammed V (CMN)', 'Mohammed V Airport (CMN)', 'مطار محمد الخامس (CMN)', 'Aeropuerto Mohammed V (CMN)') },
  { id: 'l-voyageurs', key: 'station', type: 'station', fee: 0, active: true, name: d('Gare Casa-Voyageurs', 'Casa-Voyageurs station', 'محطة الدار البيضاء المسافرين', 'Estación Casa-Voyageurs') },
  { id: 'l-address', key: 'address', type: 'address', fee: 0, active: true, name: d('Hôtel / domicile (Casablanca)', 'Hotel / home (Casablanca)', 'فندق / منزل (الدار البيضاء)', 'Hotel / domicilio (Casablanca)') },
];

export const seedFaqs = [
  {
    id: 'f-docs', category: 'conditions', sortOrder: 10, published: true,
    question: d('Quels documents faut-il pour louer une voiture à Casablanca ?', 'What documents do I need to rent a car in Casablanca?', 'ما هي الوثائق المطلوبة لكراء سيارة في الدار البيضاء؟', '¿Qué documentos necesito para alquilar un coche en Casablanca?'),
    answer: d(
      'Un permis de conduire valide depuis plus d’un an, une pièce d’identité (CIN ou passeport) et une carte bancaire au nom du conducteur pour la caution. Les permis rédigés en caractères latins sont acceptés sans permis international ; les autres doivent être accompagnés d’un permis international.',
      'A driving licence held for more than one year, an ID (national ID card or passport) and a bank card in the driver’s name for the deposit. Licences printed in Latin characters are accepted without an international permit; others must come with an International Driving Permit.',
      'رخصة سياقة سارية منذ أكثر من سنة، بطاقة هوية (البطاقة الوطنية أو جواز السفر) وبطاقة بنكية باسم السائق للضمانة. الرخص المكتوبة بالحروف اللاتينية مقبولة بدون رخصة دولية؛ أما غيرها فيجب أن تكون مرفقة برخصة سياقة دولية.',
      'Un carné de conducir con más de un año de antigüedad, un documento de identidad (DNI o pasaporte) y una tarjeta bancaria a nombre del conductor para la fianza. Los carnés en caracteres latinos se aceptan sin permiso internacional; los demás deben ir acompañados de un permiso internacional de conducir.',
    ),
  },
  {
    id: 'f-age', category: 'conditions', sortOrder: 20, published: true,
    question: d('Quel est l’âge minimum pour louer ?', 'What is the minimum age to rent?', 'ما هو الحد الأدنى لسن الكراء؟', '¿Cuál es la edad mínima para alquilar?'),
    answer: d(
      '21 ans pour les catégories citadine, compacte et SUV, 25 ans pour les véhicules premium et 28 ans pour la catégorie luxe. Aucun supplément jeune conducteur n’est appliqué entre 21 et 25 ans sur les catégories autorisées.',
      '21 for city, compact and SUV categories, 25 for premium vehicles and 28 for the luxury category. No young-driver surcharge applies between 21 and 25 on the permitted categories.',
      '21 سنة لفئات المدينة والمدمجة وSUV، و25 سنة للسيارات الفاخرة (premium)، و28 سنة لفئة اللوكس. لا تُطبَّق أي زيادة للسائق الشاب بين 21 و25 سنة في الفئات المسموح بها.',
      '21 años para las categorías urbano, compacto y SUV, 25 años para los vehículos premium y 28 para la categoría de lujo. No se aplica recargo por conductor joven entre 21 y 25 años en las categorías permitidas.',
    ),
  },
  {
    id: 'f-deposit', category: 'payment', sortOrder: 30, published: true,
    question: d('Combien coûte la caution et quand est-elle libérée ?', 'How much is the deposit and when is it released?', 'كم تبلغ الضمانة ومتى يتم تحريرها؟', '¿Cuánto es la fianza y cuándo se libera?'),
    answer: d(
      'La caution est une pré-autorisation sur carte bancaire, jamais un débit : de 3 000 MAD (citadine) à 25 000 MAD (luxe), le montant exact est affiché sur chaque fiche véhicule. Elle est libérée sous 7 jours ouvrés après la restitution du véhicule sans dommage.',
      'The deposit is a pre-authorisation on a bank card, never a charge: from MAD 3,000 (city car) to MAD 25,000 (luxury), the exact amount is displayed on each vehicle page. It is released within 7 working days after the car is returned undamaged.',
      'الضمانة هي حجز مسبق على البطاقة البنكية وليست خصماً: من 3,000 درهم (سيارة مدينة) إلى 25,000 درهم (لوكس)، ويُعرض المبلغ الدقيق في صفحة كل سيارة. يتم تحريرها خلال 7 أيام عمل بعد إرجاع السيارة دون أضرار.',
      'La fianza es una preautorización en tarjeta bancaria, nunca un cargo: de 3.000 MAD (urbano) a 25.000 MAD (lujo); el importe exacto aparece en cada ficha de vehículo. Se libera en 7 días laborables tras devolver el coche sin daños.',
    ),
  },
  {
    id: 'f-airport', category: 'delivery', sortOrder: 40, published: true,
    question: d('Livrez-vous à l’aéroport Mohammed V ?', 'Do you deliver to Mohammed V Airport?', 'هل تقومون بالتسليم في مطار محمد الخامس؟', '¿Entregan en el aeropuerto Mohammed V?'),
    answer: d(
      'Oui, 24h/24 et 7j/7, sans frais. Indiquez votre numéro de vol lors de la réservation : nous suivons l’atterrissage et vous attendons à la sortie des arrivées avec le véhicule. L’aéroport est à 31 km du centre de Casablanca par l’autoroute A7/A3.',
      'Yes, 24/7 and free of charge. Enter your flight number when booking: we track the landing and wait for you at the arrivals exit with the car. The airport is 31 km from central Casablanca via the A7/A3 motorway.',
      'نعم، على مدار الساعة طوال أيام الأسبوع وبدون رسوم. أدخل رقم رحلتك عند الحجز: نتابع موعد الهبوط وننتظرك عند مخرج الوصول مع السيارة. يبعد المطار 31 كم عن وسط الدار البيضاء عبر الطريق السيار A7/A3.',
      'Sí, 24 horas, 7 días a la semana y sin coste. Indique su número de vuelo al reservar: seguimos el aterrizaje y le esperamos a la salida de llegadas con el vehículo. El aeropuerto está a 31 km del centro de Casablanca por la autopista A7/A3.',
    ),
  },
  {
    id: 'f-insurance', category: 'insurance', sortOrder: 50, published: true,
    question: d('Quelle assurance est incluse et quelle est la franchise ?', 'What insurance is included and what is the excess?', 'ما التأمين المشمول وما مبلغ التحمل؟', '¿Qué seguro está incluido y cuál es la franquicia?'),
    answer: d(
      'Tous nos véhicules incluent la responsabilité civile, le vol et les dommages avec une franchise égale au montant de la caution. L’option « tous risques sans franchise » (80 MAD/jour) ramène votre responsabilité à zéro, hors pneus, vitrage et carburant.',
      'All our cars include third-party liability, theft and damage cover with an excess equal to the deposit amount. The “full insurance, zero excess” option (MAD 80/day) reduces your liability to zero, excluding tyres, glass and fuel.',
      'تشمل جميع سياراتنا المسؤولية المدنية والسرقة والأضرار مع تحمل يساوي مبلغ الضمانة. خيار «التأمين الشامل بدون تحمل» (80 درهم/يوم) يُلغي مسؤوليتك تماماً، باستثناء الإطارات والزجاج والوقود.',
      'Todos nuestros coches incluyen responsabilidad civil, robo y daños con una franquicia igual al importe de la fianza. La opción «todo riesgo sin franquicia» (80 MAD/día) reduce su responsabilidad a cero, salvo neumáticos, cristales y combustible.',
    ),
  },
  {
    id: 'f-km', category: 'conditions', sortOrder: 60, published: true,
    question: d('Le kilométrage est-il illimité ?', 'Is mileage unlimited?', 'هل المسافة المقطوعة غير محدودة؟', '¿El kilometraje es ilimitado?'),
    answer: d(
      'Oui pour les citadines, compactes, SUV et berlines. Les véhicules premium et luxe incluent 200 à 250 km par jour (indiqué sur chaque fiche), le kilomètre supplémentaire étant facturé 2 à 4 MAD.',
      'Yes for city cars, compacts, SUVs and sedans. Premium and luxury vehicles include 200–250 km per day (shown on each vehicle page); extra kilometres are charged MAD 2–4 each.',
      'نعم لسيارات المدينة والمدمجة وSUV والسيدان. تشمل السيارات الفاخرة واللوكس من 200 إلى 250 كم يومياً (مذكور في صفحة كل سيارة)، ويُحتسب الكيلومتر الإضافي بين 2 و4 دراهم.',
      'Sí para urbanos, compactos, SUV y berlinas. Los vehículos premium y de lujo incluyen de 200 a 250 km al día (indicado en cada ficha); el kilómetro adicional se factura a 2–4 MAD.',
    ),
  },
  {
    id: 'f-fuel', category: 'conditions', sortOrder: 70, published: true,
    question: d('Quelle est la politique carburant ?', 'What is the fuel policy?', 'ما هي سياسة الوقود؟', '¿Cuál es la política de combustible?'),
    answer: d(
      'Plein / plein : vous recevez le véhicule avec le plein et le rendez avec le plein. Aucun frais de service carburant n’est facturé si le niveau est identique.',
      'Full-to-full: you receive the car with a full tank and return it full. No fuel service fee is charged when the level matches.',
      'ممتلئ/ممتلئ: تستلم السيارة بخزان ممتلئ وتعيدها ممتلئة. لا تُفرض أي رسوم خدمة وقود إذا كان المستوى متطابقاً.',
      'Lleno/lleno: recibe el coche con el depósito lleno y lo devuelve lleno. No se cobra ningún cargo por combustible si el nivel coincide.',
    ),
  },
  {
    id: 'f-cancel', category: 'payment', sortOrder: 80, published: true,
    question: d('Puis-je annuler ou modifier ma réservation ?', 'Can I cancel or change my booking?', 'هل يمكنني إلغاء الحجز أو تعديله؟', '¿Puedo cancelar o modificar mi reserva?'),
    answer: d(
      'Oui, gratuitement jusqu’à 24 h avant la prise en charge, par WhatsApp ou e-mail. Les modifications de dates dépendent de la disponibilité du véhicule.',
      'Yes, free of charge up to 24 h before pick-up, by WhatsApp or email. Date changes depend on the vehicle’s availability.',
      'نعم، مجاناً حتى 24 ساعة قبل موعد الاستلام عبر واتساب أو البريد الإلكتروني. تعديل التواريخ يخضع لتوفر السيارة.',
      'Sí, gratis hasta 24 h antes de la recogida, por WhatsApp o correo. Los cambios de fecha dependen de la disponibilidad del vehículo.',
    ),
  },
  {
    id: 'f-payment', category: 'payment', sortOrder: 90, published: true,
    question: d('Quels moyens de paiement acceptez-vous ?', 'Which payment methods do you accept?', 'ما هي وسائل الدفع المقبولة؟', '¿Qué métodos de pago aceptan?'),
    answer: d(
      'Carte bancaire (Visa, Mastercard, CMI), espèces en dirhams à l’agence et virement bancaire pour les locations longue durée. La caution est toujours une pré-autorisation par carte.',
      'Bank card (Visa, Mastercard, CMI), cash in dirhams at the agency and bank transfer for long-term rentals. The deposit is always a card pre-authorisation.',
      'البطاقة البنكية (Visa، Mastercard، CMI)، نقداً بالدرهم في الوكالة، والتحويل البنكي للكراء طويل الأمد. الضمانة دائماً حجز مسبق على البطاقة.',
      'Tarjeta bancaria (Visa, Mastercard, CMI), efectivo en dírhams en la agencia y transferencia bancaria para alquileres de larga duración. La fianza siempre es una preautorización con tarjeta.',
    ),
  },
  {
    id: 'f-border', category: 'conditions', sortOrder: 100, published: true,
    question: d('Peut-on sortir du Maroc avec le véhicule ?', 'Can I take the car outside Morocco?', 'هل يمكن الخروج من المغرب بالسيارة؟', '¿Puedo salir de Marruecos con el coche?'),
    answer: d(
      'Non. Les véhicules de location ne peuvent pas franchir les frontières (Ceuta, Melilla, Espagne, Algérie, Mauritanie) : l’assurance ne couvre que le territoire marocain.',
      'No. Rental cars cannot cross borders (Ceuta, Melilla, Spain, Algeria, Mauritania): the insurance only covers Moroccan territory.',
      'لا. لا يمكن لسيارات الكراء عبور الحدود (سبتة، مليلية، إسبانيا، الجزائر، موريتانيا): التأمين يغطي التراب المغربي فقط.',
      'No. Los coches de alquiler no pueden cruzar fronteras (Ceuta, Melilla, España, Argelia, Mauritania): el seguro solo cubre el territorio marroquí.',
    ),
  },
  {
    id: 'f-oneway', category: 'delivery', sortOrder: 110, published: true,
    question: d('Proposez-vous des locations aller simple vers Marrakech ou Tanger ?', 'Do you offer one-way rentals to Marrakech or Tangier?', 'هل توفرون كراءً باتجاه واحد نحو مراكش أو طنجة؟', '¿Ofrecen alquileres solo ida a Marrakech o Tánger?'),
    answer: d(
      'Oui. Restitution possible à Marrakech, Rabat, Tanger ou Agadir avec des frais de rapatriement de 300 à 800 MAD selon la ville, précisés avant confirmation.',
      'Yes. Return possible in Marrakech, Rabat, Tangier or Agadir with a repatriation fee of MAD 300–800 depending on the city, confirmed before booking.',
      'نعم. يمكن الإرجاع في مراكش أو الرباط أو طنجة أو أكادير مقابل رسوم إعادة تتراوح بين 300 و800 درهم حسب المدينة، تُحدَّد قبل التأكيد.',
      'Sí. Devolución posible en Marrakech, Rabat, Tánger o Agadir con un cargo de repatriación de 300 a 800 MAD según la ciudad, confirmado antes de la reserva.',
    ),
  },
  {
    id: 'f-longterm', category: 'longterm', sortOrder: 120, published: true,
    question: d('Quels sont vos tarifs pour une location au mois ?', 'What are your monthly rental rates?', 'ما هي أسعار الكراء الشهري؟', '¿Cuáles son sus tarifas de alquiler mensual?'),
    answer: d(
      'À partir de 6 500 MAD/mois pour une citadine, 9 500 MAD/mois pour un SUV et 19 000 MAD/mois pour un véhicule premium, entretien et assurance inclus. Devis personnalisé sous 24 h pour les entreprises.',
      'From MAD 6,500/month for a city car, MAD 9,500/month for an SUV and MAD 19,000/month for a premium vehicle, maintenance and insurance included. Custom quote within 24 h for companies.',
      'ابتداءً من 6,500 درهم/شهر لسيارة مدينة، و9,500 درهم/شهر لسيارة SUV، و19,000 درهم/شهر لسيارة فاخرة، شاملة الصيانة والتأمين. عرض سعر مخصص للشركات خلال 24 ساعة.',
      'Desde 6.500 MAD/mes para un urbano, 9.500 MAD/mes para un SUV y 19.000 MAD/mes para un vehículo premium, mantenimiento y seguro incluidos. Presupuesto personalizado en 24 h para empresas.',
    ),
  },
];

export const seedReviews = [
  { id: 'r-1', authorName: 'Exemple — Yassine B.', rating: 5, lang: 'fr', source: 'google', vehicleId: 'v-tucson', published: true, isSample: true, createdAt: '2026-08-12T10:00:00.000Z', text: 'Voiture livrée à l’aéroport à 2h du matin, propre, caution bien libérée en 5 jours. Exemple d’avis à remplacer par un vrai avis Google.' },
  { id: 'r-2', authorName: 'Example — Sarah M.', rating: 5, lang: 'en', source: 'google', vehicleId: 'v-duster', published: true, isSample: true, createdAt: '2026-07-28T10:00:00.000Z', text: 'Clear prices in dirhams, no surprise at return. Sample review — replace with a real Google review.' },
  { id: 'r-3', authorName: 'مثال — خالد ع.', rating: 5, lang: 'ar', source: 'google', vehicleId: 'v-classe-c', published: true, isSample: true, createdAt: '2026-06-30T10:00:00.000Z', text: 'استقبال في المطار وسيارة نظيفة، ثمن واضح بدون مفاجآت. مثال لرأي يُستبدل برأي حقيقي من Google.' },
  { id: 'r-4', authorName: 'Ejemplo — Lucía R.', rating: 5, lang: 'es', source: 'google', vehicleId: 'v-clio', published: true, isSample: true, createdAt: '2026-05-14T10:00:00.000Z', text: 'Recogida en el aeropuerto puntual, todo explicado en español. Reseña de ejemplo — sustituir por una reseña real de Google.' },
];

export const seedPosts = [
  {
    id: 'p-documents', slug: 'documents-louer-voiture-maroc', published: true, publishedAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z', tags: ['conditions'],
    cover: 'berline',
    title: d('Documents, âge et permis : les conditions pour louer une voiture au Maroc (2026)', 'Documents, age and licence: the conditions for renting a car in Morocco (2026)', 'الوثائق والسن والرخصة: شروط كراء سيارة في المغرب (2026)', 'Documentos, edad y carné: las condiciones para alquilar un coche en Marruecos (2026)'),
    excerpt: d('Ce qu’il faut présenter à l’agence, les âges minimum par catégorie, le cas du permis international et de la carte bancaire.', 'What to bring to the agency, minimum ages by category, the international permit question and the bank card.', 'ما يجب تقديمه في الوكالة، الحد الأدنى للسن حسب الفئة، مسألة الرخصة الدولية والبطاقة البنكية.', 'Qué presentar en la agencia, edades mínimas por categoría, el permiso internacional y la tarjeta bancaria.'),
    body: d(
      `Pour louer une voiture au Maroc, il faut présenter trois documents : un permis de conduire valide depuis au moins un an, une pièce d’identité (CIN pour les résidents, passeport pour les visiteurs) et une carte bancaire au nom du conducteur principal.

## Le permis de conduire
Les permis délivrés en caractères latins (Europe, Amériques, Maghreb) sont acceptés tels quels pendant les 90 premiers jours de séjour. Les permis rédigés dans un autre alphabet (arabe du Golfe, chinois, russe, etc.) doivent être accompagnés d’un permis international ou d’une traduction assermentée.

## L’âge minimum
Chez Diab Car : 21 ans pour les citadines, compactes et SUV ; 25 ans pour les véhicules premium ; 28 ans pour la catégorie luxe. Nous n’appliquons pas de supplément « jeune conducteur ».

## La carte bancaire et la caution
La caution est une pré-autorisation sur carte bancaire (Visa, Mastercard) — jamais un débit. Le montant dépend de la catégorie : 3 000 MAD pour une citadine, 5 000 à 6 000 MAD pour un SUV, 12 000 MAD pour un véhicule premium, jusqu’à 25 000 MAD pour le luxe. Elle est libérée sous 7 jours ouvrés après restitution.

## Conducteur additionnel
Un second conducteur peut être ajouté au contrat pour 150 MAD (forfait), sous réserve des mêmes conditions de permis et d’âge.

## À retenir
Permis > 1 an, pièce d’identité, carte bancaire au nom du conducteur. Réservez à l’avance en été : la demande double entre le 15 juin et le 15 septembre.`,
      `To rent a car in Morocco you need three documents: a driving licence held for at least one year, an ID (national ID card for residents, passport for visitors) and a bank card in the main driver’s name.

## The driving licence
Licences printed in Latin characters (Europe, the Americas, the Maghreb) are accepted as they are during the first 90 days of your stay. Licences in another script (Gulf Arabic, Chinese, Russian, etc.) must be accompanied by an International Driving Permit or a sworn translation.

## Minimum age
At Diab Car: 21 for city cars, compacts and SUVs; 25 for premium vehicles; 28 for the luxury category. We do not apply a young-driver surcharge.

## Bank card and deposit
The deposit is a pre-authorisation on a bank card (Visa, Mastercard) — never a charge. The amount depends on the category: MAD 3,000 for a city car, MAD 5,000–6,000 for an SUV, MAD 12,000 for a premium vehicle, up to MAD 25,000 for luxury. It is released within 7 working days after return.

## Additional driver
A second driver can be added to the contract for a flat MAD 150, subject to the same licence and age conditions.

## Key takeaways
Licence > 1 year, ID, bank card in the driver’s name. Book early in summer: demand doubles between 15 June and 15 September.`,
      `لكراء سيارة في المغرب تحتاج إلى ثلاث وثائق: رخصة سياقة سارية منذ سنة على الأقل، وثيقة هوية (البطاقة الوطنية للمقيمين، جواز السفر للزوار) وبطاقة بنكية باسم السائق الرئيسي.

## رخصة السياقة
الرخص المكتوبة بالحروف اللاتينية (أوروبا، الأمريكتان، المغرب العربي) مقبولة كما هي خلال أول 90 يوماً من الإقامة. أما الرخص المكتوبة بأبجدية أخرى (عربية خليجية، صينية، روسية...) فيجب أن تُرفق برخصة سياقة دولية أو ترجمة محلفة.

## الحد الأدنى للسن
في دياب كار: 21 سنة لسيارات المدينة والمدمجة وSUV؛ 25 سنة للسيارات الفاخرة؛ 28 سنة لفئة اللوكس. لا نطبق أي زيادة «سائق شاب».

## البطاقة البنكية والضمانة
الضمانة هي حجز مسبق على البطاقة البنكية (Visa، Mastercard) — وليست خصماً أبداً. يعتمد المبلغ على الفئة: 3,000 درهم لسيارة مدينة، 5,000 إلى 6,000 درهم لسيارة SUV، 12,000 درهم لسيارة فاخرة، وحتى 25,000 درهم للوكس. تُحرَّر خلال 7 أيام عمل بعد الإرجاع.

## سائق إضافي
يمكن إضافة سائق ثانٍ إلى العقد مقابل 150 درهماً (مبلغ ثابت)، بنفس شروط الرخصة والسن.

## خلاصة
رخصة > سنة، وثيقة هوية، بطاقة بنكية باسم السائق. احجز مبكراً في الصيف: يتضاعف الطلب بين 15 يونيو و15 شتنبر.`,
      `Para alquilar un coche en Marruecos necesita tres documentos: un carné de conducir con al menos un año de antigüedad, un documento de identidad (DNI para residentes, pasaporte para visitantes) y una tarjeta bancaria a nombre del conductor principal.

## El carné de conducir
Los carnés en caracteres latinos (Europa, América, Magreb) se aceptan tal cual durante los primeros 90 días de estancia. Los carnés en otro alfabeto (árabe del Golfo, chino, ruso, etc.) deben ir acompañados de un permiso internacional o una traducción jurada.

## Edad mínima
En Diab Car: 21 años para urbanos, compactos y SUV; 25 para vehículos premium; 28 para la categoría de lujo. No aplicamos recargo por conductor joven.

## Tarjeta bancaria y fianza
La fianza es una preautorización en tarjeta (Visa, Mastercard), nunca un cargo. El importe depende de la categoría: 3.000 MAD para un urbano, 5.000–6.000 MAD para un SUV, 12.000 MAD para un premium, hasta 25.000 MAD para lujo. Se libera en 7 días laborables tras la devolución.

## Conductor adicional
Se puede añadir un segundo conductor al contrato por 150 MAD (tarifa fija), con las mismas condiciones de carné y edad.

## En resumen
Carné > 1 año, documento de identidad, tarjeta a nombre del conductor. Reserve con antelación en verano: la demanda se duplica entre el 15 de junio y el 15 de septiembre.`,
    ),
  },
  {
    id: 'p-airport', slug: 'location-voiture-aeroport-mohammed-v-guide', published: true, publishedAt: '2026-09-03T09:00:00.000Z', updatedAt: '2026-09-03T09:00:00.000Z', tags: ['aeroport'],
    cover: 'suv',
    title: d('Récupérer sa voiture de location à l’aéroport Mohammed V : le guide pratique', 'Picking up your rental car at Mohammed V Airport: the practical guide', 'استلام سيارة الكراء في مطار محمد الخامس: الدليل العملي', 'Recoger el coche de alquiler en el aeropuerto Mohammed V: la guía práctica'),
    excerpt: d('Distance, autoroute, péages, accueil à la sortie des arrivées, numéro de vol : tout ce qu’il faut savoir avant d’atterrir à Casablanca.', 'Distance, motorway, tolls, meet & greet at arrivals, flight number: everything to know before landing in Casablanca.', 'المسافة، الطريق السيار، الأداء، الاستقبال عند الوصول، رقم الرحلة: كل ما يجب معرفته قبل الهبوط في الدار البيضاء.', 'Distancia, autopista, peajes, recepción en llegadas, número de vuelo: todo lo que hay que saber antes de aterrizar en Casablanca.'),
    body: d(
      `L’aéroport Mohammed V (code CMN) se trouve à Nouaceur, à 31 km au sud du centre de Casablanca. Comptez 35 à 45 minutes par l’autoroute A7 puis A3 en dehors des heures de pointe, et jusqu’à 60 minutes entre 17h et 19h.

## Comment se passe la livraison ?
Vous indiquez votre numéro de vol lors de la réservation. Nous suivons l’horaire d’atterrissage en temps réel et vous attendons à la sortie des arrivées du terminal avec une pancarte à votre nom. Le contrat est signé sur place (10 minutes), les photos d’état des lieux sont partagées sur WhatsApp, et vous partez. Aucun comptoir, aucune file d’attente.

## Péage et carburant
L’autoroute Casablanca–aéroport est payante : environ 15 à 20 MAD selon la sortie, en espèces ou par carte à la barrière. Le véhicule est livré avec le plein ; une station-service se trouve à la sortie de l’aéroport et plusieurs sur l’A7.

## Vols de nuit
La livraison à l’aéroport fonctionne 24h/24, sans supplément nocturne. Pour les vols arrivant entre minuit et 6h, merci de confirmer votre numéro de vol la veille par WhatsApp.

## Restitution à l’aéroport
La restitution se fait au même endroit, au dépose-minute des départs, 15 minutes avant l’heure convenue. Prévoyez d’arriver 2h30 avant un vol international.

## Bon à savoir
- Tenez votre permis, votre pièce d’identité et votre carte bancaire à portée de main.
- Les sièges enfant sont installés avant votre arrivée si vous les avez réservés.
- Le kilométrage aéroport–centre est inclus dans tous nos forfaits.`,
      `Mohammed V Airport (code CMN) is in Nouaceur, 31 km south of central Casablanca. Allow 35–45 minutes via the A7 then A3 motorway outside rush hour, and up to 60 minutes between 5pm and 7pm.

## How does delivery work?
You enter your flight number when booking. We track the landing time in real time and wait for you at the terminal’s arrivals exit with a sign in your name. The contract is signed on the spot (10 minutes), condition photos are shared on WhatsApp, and you drive off. No counter, no queue.

## Tolls and fuel
The Casablanca–airport motorway is tolled: around MAD 15–20 depending on the exit, payable in cash or by card at the barrier. The car is delivered with a full tank; there is a petrol station at the airport exit and several on the A7.

## Night flights
Airport delivery runs 24/7 with no night surcharge. For flights landing between midnight and 6am, please confirm your flight number the day before on WhatsApp.

## Returning at the airport
Return takes place at the same spot, at the departures drop-off, 15 minutes before the agreed time. Plan to arrive 2h30 before an international flight.

## Good to know
- Keep your licence, ID and bank card within reach.
- Child seats are fitted before you arrive if booked.
- Airport–centre mileage is included in all our packages.`,
      `يقع مطار محمد الخامس (الرمز CMN) في النواصر، على بعد 31 كم جنوب وسط الدار البيضاء. احسب 35 إلى 45 دقيقة عبر الطريق السيار A7 ثم A3 خارج أوقات الذروة، وحتى 60 دقيقة بين الساعة 17:00 و19:00.

## كيف يتم التسليم؟
تُدخل رقم رحلتك عند الحجز. نتابع موعد الهبوط لحظة بلحظة وننتظرك عند مخرج الوصول بالمحطة مع لافتة تحمل اسمك. يُوقَّع العقد في المكان (10 دقائق)، وتُرسل صور حالة السيارة عبر واتساب، ثم تنطلق. لا شباك، لا طابور.

## الأداء والوقود
الطريق السيار بين الدار البيضاء والمطار مؤدى عنه: حوالي 15 إلى 20 درهماً حسب المخرج، نقداً أو بالبطاقة عند الحاجز. تُسلَّم السيارة بخزان ممتلئ؛ توجد محطة وقود عند مخرج المطار وعدة محطات على A7.

## الرحلات الليلية
يعمل التسليم في المطار على مدار الساعة بدون زيادة ليلية. للرحلات التي تصل بين منتصف الليل والسادسة صباحاً، يرجى تأكيد رقم الرحلة في اليوم السابق عبر واتساب.

## الإرجاع في المطار
يتم الإرجاع في نفس المكان، عند منطقة الإنزال بالمغادرة، قبل 15 دقيقة من الموعد المتفق عليه. خطط للوصول قبل ساعتين ونصف من الرحلة الدولية.

## معلومات مفيدة
- احتفظ برخصتك ووثيقة هويتك وبطاقتك البنكية في متناول اليد.
- تُركَّب مقاعد الأطفال قبل وصولك إذا حجزتها.
- المسافة بين المطار والمركز مشمولة في جميع عروضنا.`,
      `El aeropuerto Mohammed V (código CMN) está en Nouaceur, a 31 km al sur del centro de Casablanca. Calcule de 35 a 45 minutos por la autopista A7 y luego A3 fuera de hora punta, y hasta 60 minutos entre las 17h y las 19h.

## ¿Cómo funciona la entrega?
Indica su número de vuelo al reservar. Seguimos la hora de aterrizaje en tiempo real y le esperamos a la salida de llegadas de la terminal con un cartel con su nombre. El contrato se firma allí mismo (10 minutos), las fotos del estado del coche se comparten por WhatsApp y usted se va. Sin mostrador, sin colas.

## Peaje y combustible
La autopista Casablanca–aeropuerto es de pago: unos 15–20 MAD según la salida, en efectivo o con tarjeta en la barrera. El coche se entrega con el depósito lleno; hay una gasolinera a la salida del aeropuerto y varias en la A7.

## Vuelos nocturnos
La entrega en el aeropuerto funciona las 24 horas sin recargo nocturno. Para vuelos que llegan entre medianoche y las 6h, confirme su número de vuelo la víspera por WhatsApp.

## Devolución en el aeropuerto
La devolución se hace en el mismo lugar, en la zona de salidas, 15 minutos antes de la hora acordada. Prevea llegar 2h30 antes de un vuelo internacional.

## Conviene saber
- Tenga a mano su carné, documento de identidad y tarjeta bancaria.
- Las sillas infantiles se instalan antes de su llegada si las ha reservado.
- El kilometraje aeropuerto–centro está incluido en todas nuestras tarifas.`,
    ),
  },
  {
    id: 'p-roadtrip', slug: 'casablanca-marrakech-rabat-tanger-en-voiture-peages-2026', published: true, publishedAt: '2026-09-05T09:00:00.000Z', updatedAt: '2026-09-05T09:00:00.000Z', tags: ['roadtrip'],
    cover: 'suv-premium',
    title: d('Casablanca → Marrakech, Rabat, Tanger en voiture : temps, péages et carburant (2026)', 'Casablanca → Marrakech, Rabat, Tangier by car: times, tolls and fuel (2026)', 'الدار البيضاء ← مراكش والرباط وطنجة بالسيارة: المدة والأداء والوقود (2026)', 'Casablanca → Marrakech, Rabat, Tánger en coche: tiempos, peajes y combustible (2026)'),
    excerpt: d('Les trajets les plus demandés depuis Casablanca avec les durées réelles, les péages autoroutiers et le budget carburant par catégorie de voiture.', 'The most requested trips from Casablanca with real journey times, motorway tolls and fuel budget by car category.', 'أكثر الرحلات طلباً انطلاقاً من الدار البيضاء مع المدد الحقيقية ورسوم الطريق السيار وميزانية الوقود حسب فئة السيارة.', 'Los trayectos más solicitados desde Casablanca con tiempos reales, peajes de autopista y presupuesto de combustible por categoría.'),
    body: d(
      `Depuis Casablanca, trois destinations concentrent l’essentiel des demandes : Marrakech (A7), Rabat (A1) et Tanger (A1 puis A5). Voici les repères utiles, valables en septembre 2026 (péages et prix du carburant évoluent : vérifiez avant le départ).

## Casablanca → Marrakech (A7)
- Distance : 240 km — Durée : 2h30 à 2h45
- Péage : environ 70 à 90 MAD
- Carburant : 20 à 25 L pour une citadine diesel (~ 350 MAD aller-retour)

## Casablanca → Rabat (A1)
- Distance : 90 km — Durée : 1h à 1h15
- Péage : environ 25 MAD
- Conseil : évitez le vendredi après-midi et le dimanche soir.

## Casablanca → Tanger (A1 + A5)
- Distance : 340 km — Durée : 3h15 à 3h45
- Péage : environ 90 à 110 MAD
- Le trajet longe la côte après Kénitra ; prévoyez une pause à Larache.

## Limitations de vitesse
60 km/h en ville, 100 km/h sur route, 120 km/h sur autoroute. Les radars sont fréquents à l’entrée des villes et aux abords des péages.

## Payer le péage
En espèces ou par carte bancaire à la barrière. Le badge Jawaz (télépéage) peut être fourni sur demande pour les locations longue durée.

## Aller simple
Vous pouvez restituer le véhicule à Marrakech, Rabat, Tanger ou Agadir (frais de rapatriement de 300 à 800 MAD selon la ville).`,
      `From Casablanca, three destinations account for most requests: Marrakech (A7), Rabat (A1) and Tangier (A1 then A5). Here are the useful benchmarks, valid in September 2026 (tolls and fuel prices change: check before leaving).

## Casablanca → Marrakech (A7)
- Distance: 240 km — Time: 2h30 to 2h45
- Toll: around MAD 70–90
- Fuel: 20–25 L for a diesel city car (~ MAD 350 return)

## Casablanca → Rabat (A1)
- Distance: 90 km — Time: 1h to 1h15
- Toll: around MAD 25
- Tip: avoid Friday afternoon and Sunday evening.

## Casablanca → Tangier (A1 + A5)
- Distance: 340 km — Time: 3h15 to 3h45
- Toll: around MAD 90–110
- The road follows the coast after Kenitra; plan a stop in Larache.

## Speed limits
60 km/h in town, 100 km/h on open roads, 120 km/h on motorways. Speed cameras are frequent at city entrances and near toll plazas.

## Paying tolls
Cash or bank card at the barrier. The Jawaz electronic tag can be provided on request for long-term rentals.

## One-way
You can return the car in Marrakech, Rabat, Tangier or Agadir (repatriation fee MAD 300–800 depending on the city).`,
      `انطلاقاً من الدار البيضاء، تتركز معظم الطلبات على ثلاث وجهات: مراكش (A7)، الرباط (A1) وطنجة (A1 ثم A5). إليك المعطيات المفيدة، الصالحة في شتنبر 2026 (رسوم الأداء وأسعار الوقود تتغير: تحقق قبل الانطلاق).

## الدار البيضاء ← مراكش (A7)
- المسافة: 240 كم — المدة: 2:30 إلى 2:45
- الأداء: حوالي 70 إلى 90 درهماً
- الوقود: 20 إلى 25 لتراً لسيارة مدينة ديزل (~350 درهم ذهاباً وإياباً)

## الدار البيضاء ← الرباط (A1)
- المسافة: 90 كم — المدة: ساعة إلى 1:15
- الأداء: حوالي 25 درهماً
- نصيحة: تجنب بعد ظهر الجمعة ومساء الأحد.

## الدار البيضاء ← طنجة (A1 + A5)
- المسافة: 340 كم — المدة: 3:15 إلى 3:45
- الأداء: حوالي 90 إلى 110 دراهم
- يحاذي الطريق الساحل بعد القنيطرة؛ خطط لاستراحة في العرائش.

## حدود السرعة
60 كم/س في المدينة، 100 كم/س على الطرق، 120 كم/س على الطريق السيار. الرادارات كثيرة عند مداخل المدن وقرب محطات الأداء.

## أداء رسوم الطريق السيار
نقداً أو بالبطاقة البنكية عند الحاجز. يمكن توفير بطاقة جواز (الأداء الإلكتروني) عند الطلب للكراء طويل الأمد.

## اتجاه واحد
يمكنك إرجاع السيارة في مراكش أو الرباط أو طنجة أو أكادير (رسوم إعادة من 300 إلى 800 درهم حسب المدينة).`,
      `Desde Casablanca, tres destinos concentran la mayoría de las solicitudes: Marrakech (A7), Rabat (A1) y Tánger (A1 y luego A5). Estas son las referencias útiles, válidas en septiembre de 2026 (peajes y precios del combustible cambian: compruébelos antes de salir).

## Casablanca → Marrakech (A7)
- Distancia: 240 km — Duración: 2h30 a 2h45
- Peaje: unos 70–90 MAD
- Combustible: 20–25 L para un urbano diésel (~350 MAD ida y vuelta)

## Casablanca → Rabat (A1)
- Distancia: 90 km — Duración: 1h a 1h15
- Peaje: unos 25 MAD
- Consejo: evite el viernes por la tarde y el domingo por la noche.

## Casablanca → Tánger (A1 + A5)
- Distancia: 340 km — Duración: 3h15 a 3h45
- Peaje: unos 90–110 MAD
- La carretera bordea la costa después de Kenitra; prevea una parada en Larache.

## Límites de velocidad
60 km/h en ciudad, 100 km/h en carretera, 120 km/h en autopista. Los radares son frecuentes en las entradas de las ciudades y cerca de los peajes.

## Pagar el peaje
En efectivo o con tarjeta en la barrera. El dispositivo Jawaz (telepeaje) puede facilitarse bajo petición para alquileres de larga duración.

## Solo ida
Puede devolver el coche en Marrakech, Rabat, Tánger o Agadir (cargo de repatriación de 300 a 800 MAD según la ciudad).`,
    ),
  },
];

export const seedBookings = [
  {
    id: 'b-1', reference: 'DC-260904-7K2Q', vehicleId: 'v-tucson', status: 'confirmed', locale: 'fr', source: 'web',
    pickupKey: 'airport', pickupLabel: 'Aéroport Mohammed V (CMN)', dropoffKey: 'airport', dropoffLabel: 'Aéroport Mohammed V (CMN)',
    startAt: '2026-09-20T10:00:00.000Z', endAt: '2026-09-27T10:00:00.000Z', days: 7, flightNumber: 'AT 785',
    extras: [{ key: 'child_seat', qty: 1 }], customerName: 'Demo — Karim El Fassi', customerPhone: '+33612345678', customerEmail: 'karim@example.com', customerCountry: 'FR', driverAge: 38,
    priceBreakdown: { basePerDay: 550, subtotal: 3850, discountPct: 10, discountAmount: 385, seasonAdjustment: 0, extrasTotal: 210, deliveryFee: 0, oneWayFee: 0, total: 3675, deposit: 6000 },
    totalMad: 3675, notes: 'Réservation de démonstration.', createdAt: '2026-09-04T14:22:00.000Z',
  },
  {
    id: 'b-2', reference: 'DC-260905-M4XZ', vehicleId: 'v-classe-c', status: 'pending', locale: 'ar', source: 'web',
    pickupKey: 'address', pickupLabel: 'Hôtel Hyatt Regency, Casablanca', dropoffKey: 'airport', dropoffLabel: 'Aéroport Mohammed V (CMN)',
    startAt: '2026-09-12T09:00:00.000Z', endAt: '2026-09-15T09:00:00.000Z', days: 3, flightNumber: '',
    extras: [{ key: 'full_insurance', qty: 1 }], customerName: 'Demo — عبدالله القحطاني', customerPhone: '+966501234567', customerEmail: 'abdullah@example.com', customerCountry: 'SA', driverAge: 41,
    priceBreakdown: { basePerDay: 1100, subtotal: 3300, discountPct: 0, discountAmount: 0, seasonAdjustment: 0, extrasTotal: 240, deliveryFee: 0, oneWayFee: 0, total: 3540, deposit: 12000 },
    totalMad: 3540, notes: '', createdAt: '2026-09-05T08:10:00.000Z',
  },
  {
    id: 'b-3', reference: 'DC-260828-A9PL', vehicleId: 'v-clio', status: 'completed', locale: 'es', source: 'whatsapp',
    pickupKey: 'agency', pickupLabel: 'Agence — 356 Bd Zerktouni', dropoffKey: 'agency', dropoffLabel: 'Agence — 356 Bd Zerktouni',
    startAt: '2026-08-28T10:00:00.000Z', endAt: '2026-09-01T10:00:00.000Z', days: 4, flightNumber: '',
    extras: [], customerName: 'Demo — Lucía Romero', customerPhone: '+34600123456', customerEmail: 'lucia@example.com', customerCountry: 'ES', driverAge: 29,
    priceBreakdown: { basePerDay: 280, subtotal: 1120, discountPct: 0, discountAmount: 0, seasonAdjustment: 0, extrasTotal: 0, deliveryFee: 0, oneWayFee: 0, total: 1120, deposit: 3000 },
    totalMad: 1120, notes: '', createdAt: '2026-08-25T16:40:00.000Z',
  },
];

export const seedSeo = [
  { id: 'seo-home', pathKey: '/', title: d('', '', '', ''), description: d('', '', '', '') },
];
