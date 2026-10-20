export function DiagramEmptyState() {
  return (
    <div className="diagram-empty" role="status">
      <h3>Sin estructura para visualizar</h3>
      <p>
        Este commit no contiene archivos TypeScript analizables o la vista elegida no
        tiene elementos. Probá con otra vista o con otro commit del histórico.
      </p>
    </div>
  );
}
