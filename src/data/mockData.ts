export interface Product {
  id: string;
  name: string;
  category: 'Brincos' | 'Colares' | 'Pulseiras' | 'Anéis' | 'Conjuntos';
  price: number;
  originalPrice?: number;
  image: string;
  description: string;
  isFeatured: boolean;
  // Category specific filter tags
  earringType?: 'Argolas' | 'Pontos de luz' | 'Ear cuffs' | 'Estilo minimalista' | 'Com pedras' | 'Tendências';
  color?: 'Dourado' | 'Prateado' | 'Rosé' | 'Preto' | 'Colorido';
  material?: 'Aço inox' | 'Aço cirúrgico' | 'Com zircônia' | 'Pérola artificial';
  isNewArrival?: boolean;
}

export interface Category {
  id: string;
  name: string;
  image: string;
  itemCount: string;
  slug: string;
}

export interface HeroSlide {
  id: string;
  title: string;
  subtitle: string;
  ctaText: string;
  scriptText: string;
  image: string;
}

export interface Benefit {
  id: string;
  title: string;
  description: string;
  iconName: 'truck' | 'shield' | 'creditCard' | 'headset' | 'heart';
}

export interface InstagramPost {
  id: string;
  image: string;
  alt: string;
  caption: string;
  likes: number;
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'slide-1',
    title: 'Seu estilo merece brilhar.',
    subtitle: 'Acessórios que acompanham você em todos os momentos.',
    ctaText: 'EXPLORAR COLEÇÃO',
    scriptText: 'Mais que acessórios, é sobre você!',
    image: '/src/assets/images/hero_lola_model_1791578690867.jpg',
  },
  {
    id: 'slide-2',
    title: 'Essenciais em Aço Inox.',
    subtitle: 'Brilho dourado sofisticado, resistente à água e ao desgaste diário.',
    ctaText: 'VER LANÇAMENTOS',
    scriptText: 'Elegância que não perde o brilho!',
    image: '/src/assets/images/hero_lola_model_1791578690867.jpg',
  },
  {
    id: 'slide-3',
    title: 'Composições que Inspiram.',
    subtitle: 'Mix de argolas, correntes e anéis para compor o seu visual favorito.',
    ctaText: 'MONTAR MEU MIX',
    scriptText: 'Beleza autêntica todos os dias!',
    image: '/src/assets/images/hero_lola_model_1791578690867.jpg',
  },
];

export const CATEGORIES: Category[] = [
  {
    id: 'cat-brincos',
    name: 'Brincos',
    image: '/src/assets/images/product_earrings_1791578709776.jpg',
    itemCount: '48 peças',
    slug: 'brincos',
  },
  {
    id: 'cat-colares',
    name: 'Colares',
    image: '/src/assets/images/product_necklace_1791578719682.jpg',
    itemCount: '24 peças',
    slug: 'colares',
  },
  {
    id: 'cat-pulseiras',
    name: 'Pulseiras',
    image: '/src/assets/images/product_bracelets_1791578728452.jpg',
    itemCount: '15 peças',
    slug: 'pulseiras',
  },
  {
    id: 'cat-aneis',
    name: 'Anéis',
    image: '/src/assets/images/product_rings_1791578737141.jpg',
    itemCount: '12 peças',
    slug: 'aneis',
  },
  {
    id: 'cat-conjuntos',
    name: 'Conjuntos',
    image: '/src/assets/images/hero_lola_model_1791578690867.jpg',
    itemCount: '8 conjuntos',
    slug: 'conjuntos',
  },
];

// Complete Earring Products Catalog matching Design 02 Reference
export const EARRINGS_CATALOG: Product[] = [
  {
    id: 'brinco-1',
    name: 'Brinco Argola Lisa',
    category: 'Brincos',
    price: 49.90,
    image: '/src/assets/images/product_earrings_1791578709776.jpg',
    description: 'Argola em aço inoxidável com acabamento polido espelhado e fecho click anatômico. Resistente, hipoalergênica e atemporal.',
    earringType: 'Argolas',
    color: 'Dourado',
    material: 'Aço inox',
    isFeatured: true,
  },
  {
    id: 'brinco-2',
    name: 'Brinco Coração Pequeno',
    category: 'Brincos',
    price: 39.90,
    image: '/src/assets/images/earrings_heart_stud_1791580831036.jpg',
    description: 'Brinco delicado em formato de coração em aço inox com banho de ouro 18k e tarraxa confortável.',
    earringType: 'Estilo minimalista',
    color: 'Dourado',
    material: 'Aço inox',
    isFeatured: true,
    isNewArrival: true,
  },
  {
    id: 'brinco-3',
    name: 'Brinco Argola Torcida',
    category: 'Brincos',
    price: 54.90,
    image: '/src/assets/images/earrings_twisted_hoop_1791580841517.jpg',
    description: 'Argola clássica com textura torcida entrelaçada, brilho facetado e fecho italiano firme e seguro.',
    earringType: 'Argolas',
    color: 'Dourado',
    material: 'Aço inox',
    isFeatured: true,
  },
  {
    id: 'brinco-4',
    name: 'Ear Cuff Cravejado',
    category: 'Brincos',
    price: 59.90,
    image: '/src/assets/images/earrings_ear_cuff_1791580851230.jpg',
    description: 'Ear cuff anatômico ajustável com micro cravação de zircônias cúbicas brilhantes sobre aço cirúrgico.',
    earringType: 'Ear cuffs',
    color: 'Dourado',
    material: 'Com zircônia',
    isFeatured: true,
  },
  {
    id: 'brinco-5',
    name: 'Brinco Gota',
    category: 'Brincos',
    price: 44.90,
    image: '/src/assets/images/earrings_teardrop_1791580862381.jpg',
    description: 'Design escultural contemporâneo em forma de gota suave, ultra leve e elegante para todos os momentos.',
    earringType: 'Estilo minimalista',
    color: 'Dourado',
    material: 'Aço inox',
    isFeatured: true,
  },
  {
    id: 'brinco-6',
    name: 'Brinco Ponto de Luz',
    category: 'Brincos',
    price: 34.90,
    image: '/src/assets/images/earrings_ear_cuff_1791580851230.jpg',
    description: 'Clássico ponto de luz solitário com zircônia de alta refração em caixa quadrada polida em aço inoxidável.',
    earringType: 'Pontos de luz',
    color: 'Dourado',
    material: 'Com zircônia',
    isFeatured: true,
  },
  {
    id: 'brinco-7',
    name: 'Brinco Argola com Zircônia',
    category: 'Brincos',
    price: 69.90,
    image: '/src/assets/images/earrings_twisted_hoop_1791580841517.jpg',
    description: 'Argola cravejada na parte frontal com zircônias cristalinas para um brilho sofisticado e refinado.',
    earringType: 'Argolas',
    color: 'Dourado',
    material: 'Com zircônia',
    isFeatured: true,
  },
  {
    id: 'brinco-8',
    name: 'Brinco Coração Texturizado',
    category: 'Brincos',
    price: 42.90,
    image: '/src/assets/images/earrings_heart_stud_1791580831036.jpg',
    description: 'Coração em relevo com acabamento martelado artesanal, conferindo reflexos dourados únicos.',
    earringType: 'Estilo minimalista',
    color: 'Dourado',
    material: 'Aço inox',
    isFeatured: true,
  },
  {
    id: 'brinco-9',
    name: 'Brinco Argola Grossa',
    category: 'Brincos',
    price: 59.90,
    image: '/src/assets/images/product_earrings_1791578709776.jpg',
    description: 'Chunky hoop moderna de tubo largo, pesada no visual mas leve e oca na orelha para conforto máximo.',
    earringType: 'Argolas',
    color: 'Dourado',
    material: 'Aço inox',
    isFeatured: true,
  },
  {
    id: 'brinco-10',
    name: 'Brinco Gota Alongada',
    category: 'Brincos',
    price: 56.90,
    image: '/src/assets/images/earrings_teardrop_1791580862381.jpg',
    description: 'Pêndulo de gota esbelta com movimento fluido e pino anatômico antialérgico.',
    earringType: 'Tendências',
    color: 'Dourado',
    material: 'Aço inox',
    isFeatured: true,
  },
  {
    id: 'brinco-11',
    name: 'Brinco Argola Esmaltada',
    category: 'Brincos',
    price: 46.90,
    image: '/src/assets/images/product_earrings_1791578709776.jpg',
    description: 'Argola bicolore com esmaltação preta brilhante sobre aço cirúrgico dourado, acabamento de alta joalheria.',
    earringType: 'Tendências',
    color: 'Preto',
    material: 'Aço inox',
    isFeatured: true,
    isNewArrival: true,
  },
  {
    id: 'brinco-12',
    name: 'Brinco Pérola',
    category: 'Brincos',
    price: 49.90,
    image: '/src/assets/images/earrings_pearl_1791580874887.jpg',
    description: 'Pérola barroca artificial com lustre nacarado e base em aço inoxidável dourado resistente.',
    earringType: 'Estilo minimalista',
    color: 'Dourado',
    material: 'Pérola artificial',
    isFeatured: true,
  },
  // Additional catalog items for pagination & alternative colors/materials
  {
    id: 'brinco-13',
    name: 'Argola Prateada Espelhada',
    category: 'Brincos',
    price: 44.90,
    image: '/src/assets/images/product_earrings_1791578709776.jpg',
    description: 'Argola clássica em aço inoxidável prata polida com acabamento espelhado e fecho click.',
    earringType: 'Argolas',
    color: 'Prateado',
    material: 'Aço inox',
    isFeatured: false,
  },
  {
    id: 'brinco-14',
    name: 'Ponto de Luz Prata Zircônia',
    category: 'Brincos',
    price: 29.90,
    image: '/src/assets/images/earrings_ear_cuff_1791580851230.jpg',
    description: 'Ponto de luz delicado em aço cirúrgico prateado com pedra solitária cristal.',
    earringType: 'Pontos de luz',
    color: 'Prateado',
    material: 'Aço cirúrgico',
    isFeatured: false,
  },
  {
    id: 'brinco-15',
    name: 'Brinco Rosé Orgânico',
    category: 'Brincos',
    price: 52.90,
    image: '/src/assets/images/earrings_teardrop_1791580862381.jpg',
    description: 'Brinco com banho em ouro rosé e design orgânico acetinado.',
    earringType: 'Estilo minimalista',
    color: 'Rosé',
    material: 'Aço inox',
    isFeatured: false,
  },
  {
    id: 'brinco-16',
    name: 'Ear Cuff Duplo Prateado',
    category: 'Brincos',
    price: 49.90,
    image: '/src/assets/images/earrings_ear_cuff_1791580851230.jpg',
    description: 'Ear cuff com dois aros entrelaçados em aço cirúrgico polido.',
    earringType: 'Ear cuffs',
    color: 'Prateado',
    material: 'Aço cirúrgico',
    isFeatured: false,
  },
  {
    id: 'brinco-17',
    name: 'Argola Rainbow Cravejada',
    category: 'Brincos',
    price: 64.90,
    image: '/src/assets/images/earrings_twisted_hoop_1791580841517.jpg',
    description: 'Argola cravejada com micro zircônias coloridas em degradê suave.',
    earringType: 'Com pedras',
    color: 'Colorido',
    material: 'Com zircônia',
    isFeatured: false,
  },
  {
    id: 'brinco-18',
    name: 'Argola Tube Médio',
    category: 'Brincos',
    price: 49.90,
    image: '/src/assets/images/product_earrings_1791578709776.jpg',
    description: 'Tubo cilíndrico polido com fecho invisível e acabamento impecável.',
    earringType: 'Argolas',
    color: 'Dourado',
    material: 'Aço inox',
    isFeatured: false,
  },
  {
    id: 'brinco-19',
    name: 'Brinco Estrela Cadente',
    category: 'Brincos',
    price: 38.90,
    image: '/src/assets/images/earrings_heart_stud_1791580831036.jpg',
    description: 'Estrela em aço inox dourado com caimento assimétrico delicado.',
    earringType: 'Estilo minimalista',
    color: 'Dourado',
    material: 'Aço inox',
    isFeatured: false,
  },
  {
    id: 'brinco-20',
    name: 'Ponto de Luz Navete',
    category: 'Brincos',
    price: 36.90,
    image: '/src/assets/images/earrings_ear_cuff_1791580851230.jpg',
    description: 'Zircônia formato navete com engaste moderno de duas garras.',
    earringType: 'Pontos de luz',
    color: 'Dourado',
    material: 'Com zircônia',
    isFeatured: false,
  },
];

export const FEATURED_PRODUCTS: Product[] = [
  ...EARRINGS_CATALOG.slice(0, 5),
  {
    id: 'prod-colar-1',
    name: 'Colar Coração',
    category: 'Colares',
    price: 59.90,
    image: '/src/assets/images/product_necklace_1791578719682.jpg',
    description: 'Corrente delicada com pingente de coração em madrepérola e banho ouro sobre aço inox durável.',
    isFeatured: true,
  },
  {
    id: 'prod-pulseira-1',
    name: 'Pulseira Corrente',
    category: 'Pulseiras',
    price: 54.90,
    image: '/src/assets/images/product_bracelets_1791578728452.jpg',
    description: 'Composição de elos finos e bracelete rígido em aço inox dourado com fecho seguro ajustável.',
    isFeatured: true,
  },
  {
    id: 'prod-anel-1',
    name: 'Anel Ajustável',
    category: 'Anéis',
    price: 39.90,
    image: '/src/assets/images/product_rings_1791578737141.jpg',
    description: 'Anel de aro duplo entrelaçado com design escultural contemporâneo e ajuste flexível.',
    isFeatured: true,
  },
  {
    id: 'prod-colar-2',
    name: 'Colar Duplo',
    category: 'Colares',
    price: 64.90,
    image: '/src/assets/images/product_necklace_1791578719682.jpg',
    description: 'Mix de duas correntes com pingente solitário de brilho suave e acabamento antialérgico.',
    isFeatured: true,
  },
];

export const BENEFITS: Benefit[] = [
  {
    id: 'ben-1',
    title: 'Frete para todo o Brasil',
    description: 'Com rastreamento',
    iconName: 'truck',
  },
  {
    id: 'ben-2',
    title: 'Compra segura',
    description: 'Seus dados protegidos',
    iconName: 'shield',
  },
  {
    id: 'ben-3',
    title: 'Diversas formas de pagamento',
    description: 'Pix, cartão e mais',
    iconName: 'creditCard',
  },
  {
    id: 'ben-4',
    title: 'Atendimento próximo',
    description: 'Tire suas dúvidas',
    iconName: 'headset',
  },
  {
    id: 'ben-5',
    title: 'Qualidade garantida',
    description: 'Aço inox e alta durabilidade',
    iconName: 'heart',
  },
];

export const INSTAGRAM_POSTS: InstagramPost[] = [
  {
    id: 'insta-1',
    image: '/src/assets/images/hero_lola_model_1791578690867.jpg',
    alt: 'Close-up do brinco de argola dourada no estilo casual chique',
    caption: 'Detalhes que transformam qualquer look básico em pura elegância ✨ #lolaacessorios',
    likes: 184,
  },
  {
    id: 'insta-2',
    image: '/src/assets/images/product_necklace_1791578719682.jpg',
    alt: 'Mix de colares com pingente de coração sobre tecido de linho',
    caption: 'O colar coração é aquele xodó que combina com tudo! Quem ama? 🤍',
    likes: 247,
  },
  {
    id: 'insta-3',
    image: '/src/assets/images/product_bracelets_1791578728452.jpg',
    alt: 'Mix de pulseiras douradas delicadas sobre tecido cru',
    caption: 'Layering de pulseiras: quanto mais, melhor! Qual é a sua favorita? 💫',
    likes: 198,
  },
  {
    id: 'insta-4',
    image: '/src/assets/images/hero_lola_model_1791578690867.jpg',
    alt: 'Modelo usando a composição completa de acessórios dourados Lola',
    caption: 'Brilho que acompanha a sua rotina do trabalho ao jantar especial. 🌟',
    likes: 312,
  },
  {
    id: 'insta-5',
    image: '/src/assets/images/product_earrings_1791578709776.jpg',
    alt: 'Par de brincos argolas douradas clássicas em alta definição',
    caption: 'Aço inox: não escurece, não descasca e te deixa radiante sempre. ✨',
    likes: 265,
  },
];

export const CART_RECOMMENDED_PRODUCTS: Product[] = [
  {
    id: 'rec-1',
    name: 'Brinco Argola Grossa',
    category: 'Brincos',
    price: 59.90,
    image: '/src/assets/images/product_earrings_1791578709776.jpg',
    description: 'Chunky hoop moderna de tubo largo em aço inoxidável dourado.',
    isFeatured: true,
  },
  {
    id: 'rec-2',
    name: 'Colar Delicado',
    category: 'Colares',
    price: 44.90,
    image: '/src/assets/images/product_necklace_1791578719682.jpg',
    description: 'Corrente fina com pingente geométrico sutil e fecho seguro.',
    isFeatured: true,
  },
  {
    id: 'rec-3',
    name: 'Pulseira Ajustável',
    category: 'Pulseiras',
    price: 39.90,
    image: '/src/assets/images/product_bracelets_1791578728452.jpg',
    description: 'Pulseira de elos finos com berloques delicados e extensor.',
    isFeatured: true,
  },
  {
    id: 'rec-4',
    name: 'Brinco Coração Pequeno',
    category: 'Brincos',
    price: 34.90,
    image: '/src/assets/images/earrings_heart_stud_1791580831036.jpg',
    description: 'Brinco delicado em formato de coração em aço inox.',
    isFeatured: true,
  },
  {
    id: 'rec-5',
    name: 'Anel Minimalista',
    category: 'Anéis',
    price: 42.90,
    image: '/src/assets/images/product_rings_1791578737141.jpg',
    description: 'Aro duplo entrelaçado com acabamento polido de alto brilho.',
    isFeatured: true,
  },
];
