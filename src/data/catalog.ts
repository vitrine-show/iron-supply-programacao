import raw from "./catalog.json";

export type Format = "post" | "story";

export type Product = {
  id: string;
  name: string;
  captions: string[];
};

export type Piece = {
  id: string;
  product: string;
  format: Format;
  image: string;
  w: number;
  h: number;
};

type Raw = {
  products: Product[];
  pieces: Array<Piece & { bytes?: number }>;
};

const data = raw as Raw;

export const products: Product[] = data.products;

export const pieces: Piece[] = data.pieces.map(({ bytes: _bytes, ...piece }) => piece);

const order = new Map(products.map((product, index) => [product.id, index]));

export const piecesSorted: Piece[] = [...pieces].sort((a, b) => {
  if (a.format !== b.format) return a.format === "story" ? -1 : 1;
  const byProduct = (order.get(a.product) ?? 0) - (order.get(b.product) ?? 0);
  if (byProduct) return byProduct;
  return a.id.localeCompare(b.id, "pt");
});

export function productById(id: string): Product {
  const product = products.find((item) => item.id === id);
  if (!product) throw new Error(`Produto ausente: ${id}`);
  return product;
}

export function defaultCaptionIndex(piece: Piece): number {
  const posts = piecesSorted.filter(
    (item) => item.product === piece.product && item.format === "post",
  );
  const index = Math.max(0, posts.findIndex((item) => item.id === piece.id));
  const total = productById(piece.product).captions.length;
  return total ? index % total : 0;
}
