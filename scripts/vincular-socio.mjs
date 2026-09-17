/**
 * Depois de criar o login: sócio com o mesmo apelido (primeira palavra do
 * nome) e sem login vinculado recebe o usuário. Chamado por criar-usuario.mjs.
 */
export async function vincularSocio(admin, usuarioId, nomeNormalizado, perfil) {
  if (perfil === "piloto") return;
  const apelido = nomeNormalizado.split(" ")[0];
  const { data: socio } = await admin.from("socios").select("id, apelido, usuario_id").eq("apelido", apelido).maybeSingle();
  if (!socio) {
    console.log(`  · nenhum sócio com apelido ${apelido}; vincule em Cadastros se for sócio.`);
    return;
  }
  if (socio.usuario_id && socio.usuario_id !== usuarioId) {
    console.log(`  · o sócio ${apelido} já está vinculado a outro login.`);
    return;
  }
  const { error } = await admin.from("socios").update({ usuario_id: usuarioId }).eq("id", socio.id);
  console.log(error ? `  · não vinculei ao sócio ${apelido}: ${error.message}` : `  · vinculado ao sócio ${apelido}.`);
}
