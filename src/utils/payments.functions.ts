import { createServerFn } from "@tanstack/react-start";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

type CheckoutSessionResult = { clientSecret: string } | { error: string };

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((data: {
    priceId: string;
    customerEmail?: string;
    returnUrl: string;
    environment: StripeEnv;
  }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(data.priceId)) throw new Error("Invalid priceId");
    return data;
  })
  .handler(async ({ data }): Promise<CheckoutSessionResult> => {
    try {
      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error("Price not found");
      const stripePrice = prices.data[0];
      const isRecurring = stripePrice.type === "recurring";

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        automatic_tax: { enabled: true },
        ...(data.customerEmail && { customer_email: data.customerEmail }),
      });

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });import { createSupabaseAdminClient }
from "@/lib/supabase.server";type ConfirmResult = {

activated:true;
validUntil:string | null;

}

|

{

error:string;

};export const confirmCheckoutSession =
createServerFn({

method:"POST"

})

.inputValidator(

(data:{

sessionId:string;
environment:StripeEnv;
userId:string;

})=>{

return data;

}

)

.handler(async({data})=>{

try{

const stripe=
createStripeClient(
data.environment
);


const session=
await stripe.checkout.sessions.retrieve(

data.sessionId,

{

expand:["subscription"]

}

);


const paid=

session.payment_status==="paid"

||

session.status==="complete";


if(!paid){

return{

error:"Pagamento não confirmado."

};

}


const validUntil=
new Date();

validUntil.setDate(
validUntil.getDate()+30
);


const supabaseAdmin=
createSupabaseAdminClient();


await supabaseAdmin

.from("subscribers")

.update({

valid_until:
validUntil.toISOString(),

updated_at:
new Date().toISOString(),

})

.eq(

"id",
data.userId

);


return{

activated:true,
validUntil:
validUntil.toISOString()

};

}catch(error){

return{

error:
getStripeErrorMessage(error)

};

}

});
