export interface ClothingProduct {
  id: string;
  name: string;
  image: string;
  description: string;
}

export const WHATSAPP_NUMBER_RAW = '5492216945414';
export const WHATSAPP_DISPLAY = '+54 9 221 694-5414';
export const WHATSAPP_SHORT = '221 694-5414';
export const DEFAULT_SPREADSHEET_ID = '12DCJWw0J_Fm40NATavuNDcqCGxZc5EEy7fIYFratF5c';
export const BRAND_LOGO_PATH = '/assets/aistudio/IMG-20261119-WA0028_b9c14084.jpg';
export const HERO_IMAGE_PATH = '/src/assets/images/hero_leon_editorial_1795294848859.jpg';

export const HERO_CAROUSEL_IMAGES: Array<{ src: string; alt: string }> = [
  {
    src: '/src/assets/images/hero_leon_editorial_1795294848859.jpg',
    alt: 'Colección masculina y femenina de León Indumentaria',
  },
  {
    src: '/src/assets/images/hero_leon_urban_duo_1795352226384.jpg',
    alt: 'Línea urbana masculina y femenina con campera bomber y buzo oversize',
  },
  {
    src: '/src/assets/images/hero_leon_sastreria_1795352226462.jpg',
    alt: 'Sastrería femenina y abrigo masculino de León Indumentaria',
  },
  {
    src: '/src/assets/images/hero_leon_denim_collection_1795352226546.jpg',
    alt: 'Colección denim y prendas urbanas para hombre y mujer',
  },
];

export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER_RAW}?text=${encodeURIComponent(message)}`;
}

export const DEFAULT_PRODUCTS: ClothingProduct[] = [
  {
    id: 'campera-bomber-leon',
    name: 'Campera Bomber León',
    image: '/src/assets/images/product_campera_bomber_1795294848403.jpg',
    description:
      'Paño negro estructurado con cierre metálico cepillado y terminaciones en rib. Disponible por mayor y menor.',
  },
  {
    id: 'buzo-hoodie-oversize',
    name: 'Buzo Hoodie Oversize',
    image: '/src/assets/images/product_buzo_oversize_1795294848628.jpg',
    description:
      'Frisa pesada 100% algodón peinado gris grafito con moldería unisex. Curva completa de talles.',
  },
  {
    id: 'blazer-sastrero-dama',
    name: 'Blazer Sastrero Dama',
    image: '/src/assets/images/product_blazer_dama_1795294848366.jpg',
    description:
      'Crepe sastrero marfil perla de corte entallado y solapa estructurada. Confección femenina de temporada.',
  },
  {
    id: 'jean-raw-urban',
    name: 'Jean Raw Urban',
    image: '/src/assets/images/product_jean_urban_1795294848450.jpg',
    description:
      'Denim rígido 14 oz índigo oscuro de calce recto relajado. Envíos a todo el país por mayor y menor.',
  },
];
