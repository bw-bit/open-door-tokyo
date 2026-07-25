const steps = [
  { number: "01", title: "撮影・入力", en: "Capture" },
  { number: "02", title: "証拠を確認", en: "Review" },
  { number: "03", title: "公開", en: "Publish" }
];

export function ProcessSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav className="process-steps" aria-label="作成ステップ">
      {steps.map((step, index) => {
        const position = index + 1;
        const state =
          position < current ? "done" : position === current ? "current" : "upcoming";
        return (
          <div className={`process-step ${state}`} key={step.number}>
            <span className="step-number">{step.number}</span>
            <span>
              <strong>{step.title}</strong>
              <small>{step.en}</small>
            </span>
          </div>
        );
      })}
    </nav>
  );
}

