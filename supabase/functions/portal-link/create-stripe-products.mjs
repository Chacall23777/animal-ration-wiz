import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "COLE_SUA_SECRET_KEY_AQUI");

async function main() {
  const product = await stripe.products.create({
    name: "Aguiar Nutrição Animal — Acesso",
    description: "Acesso completo à calculadora, plantel e consultor IA.",
  });

  const monthly = await stripe.prices.create({
    product: product.id,
    currency: "brl",
    unit_amount: 5000, // R$ 50,00
    recurring: { interval: "month" },
    nickname: "Mensal",
  });

  const annual = await stripe.prices.create({
    product: product.id,
    currency: "brl",
    unit_amount: 48000, // R$ 480,00
    recurring: { interval: "year" },
    nickname: "Anual",
  });

  console.log("\n✅ Produto criado:", product.id);
  console.log("STRIPE_PRICE_ID_MONTHLY=" + monthly.id);
  console.log("STRIPE_PRICE_ID_ANNUAL=" + annual.id);
  console.log("\nCopie essas duas linhas e cole nas variáveis de ambiente do Supabase (Passo 2).\n");
}

main().catch(console.error);
