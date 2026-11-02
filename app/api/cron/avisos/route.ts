import { criarClienteAdmin } from "@/lib/supabase/admin";
import { garantirEscolhaAberta } from "@/lib/dados/agenda";

/**
 * Disparo diário dos avisos que dependem da data (agendado em
 * vercel.json): pedido de reserva que passou das 48 h sem objeção é
 * liberado e o sócio fica sabendo; reserva que terminou sem voo
 * lançado avisa o piloto e o sócio; os blocos do calendário do mês
 * seguinte são criados.
 *
 * Antes isso só rodava quando alguém abria o app — quem não abrisse
 * não era avisado. Sem sessão aqui, então vai pela chave secreta.
 *
 * Trancada pelo CRON_SECRET, que a Vercel manda no cabeçalho quando a
 * variável existe. Sem a variável a rota recusa tudo (é uma rota
 * pública que mexe em reservas: aberta, qualquer um dispararia) — então
 * o disparo diário só funciona depois de criar CRON_SECRET na Vercel.
 */
export const dynamic = "force-dynamic";

export async function GET(pedido: Request) {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) {
    console.error("cron/avisos: falta CRON_SECRET na Vercel — disparo diário recusado.");
    return Response.json({ ok: false, erro: "CRON_SECRET não configurado" }, { status: 503 });
  }
  if (pedido.headers.get("authorization") !== `Bearer ${segredo}`) {
    return Response.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  }
  try {
    const admin = criarClienteAdmin();
    const { data: aeronave, error } = await admin.from("aeronaves").select("id").eq("ativo", true).order("created_at").limit(1).maybeSingle();
    if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });
    if (!aeronave) return Response.json({ ok: false, erro: "nenhuma aeronave cadastrada" }, { status: 500 });
    // Cliente da chave secreta no lugar do da sessão (as RPCs da agenda
    // são security definer e não dependem de quem está logado).
    await garantirEscolhaAberta(aeronave.id as string, admin as unknown as Parameters<typeof garantirEscolhaAberta>[1]);
    return Response.json({ ok: true, em: new Date().toISOString() });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("cron/avisos:", erro);
    return Response.json({ ok: false, erro }, { status: 500 });
  }
}
