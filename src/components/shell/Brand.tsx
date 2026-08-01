export function Brand({ heading = false }: { heading?: boolean }) {
  const Wordmark = heading ? "h1" : "span";

  return (
    <div className="brand" data-brand>
      <img
        className="brand__mark"
        src="/brand-mark.svg"
        alt=""
        aria-hidden="true"
      />
      <Wordmark className="brand__wordmark" data-brand-wordmark>
        Combinado
      </Wordmark>
    </div>
  );
}
