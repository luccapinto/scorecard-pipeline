/**
 * Persistent and not dismissible, on every demo screen.
 *
 * In a project whose subject is detecting fabricated evidence, a synthetic
 * dataset that can be mistaken for real data — in a screenshot, a shared link,
 * a recording — would undo the argument. This used to be a full-width banner;
 * it is now a mark in the masthead, which keeps the guarantee (no frame is
 * ambiguous about what it shows) without shouting over the product.
 */
export function DemoMarker() {
  return (
    <p className="demo-marker">
      <span className="demo-marker__dot" aria-hidden="true" />
      <span className="demo-marker__text">Dados fictícios</span>
      <span className="sr-only">
        : modo demonstração. Pessoas, vagas e decisões são fictícias, e tudo roda no seu
        navegador — nenhuma requisição sai da página.
      </span>
    </p>
  );
}
