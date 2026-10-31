const data = window.UPGRADEPROOF_RESULTS;

function text(value) {
  return document.createTextNode(value == null ? "" : String(value));
}

function verdictCell(verdict) {
  const span = document.createElement("span");
  span.className = `verdict ${verdict}`;
  span.appendChild(text(verdict));
  return span;
}

if (!data) {
  document.querySelector("#summary").textContent = "No results.js yet. Run the benchmark.";
} else {
  const summary = document.querySelector("#summary");
  for (const [mode, agg] of Object.entries(data.aggregates)) {
    const card = document.createElement("article");
    card.className = "card";
    const title = document.createElement("h2");
    title.appendChild(text(mode));
    const rate = document.createElement("p");
    rate.className = "metric";
    rate.appendChild(text(`${agg.verified_successes}/${agg.challenge_cases} verified`));
    const detail = document.createElement("p");
    detail.appendChild(text(`${agg.regressions} regressions · ${agg.abstentions} abstentions`));
    const extra = document.createElement("p");
    extra.appendChild(text(
      `${agg.wall_clock_seconds}s · ${agg.model_calls} model calls · $${agg.cost_per_verified_repair_usd} per verified repair`
    ));
    card.append(title, rate, detail, extra);
    summary.appendChild(card);
  }
  const generated = document.createElement("p");
  generated.className = "note";
  generated.appendChild(text(`Recorded ${data.generated_at} (UTC).`));
  summary.after(generated);

  const body = document.querySelector("#cases tbody");
  for (const row of data.rows) {
    const tr = document.createElement("tr");
    for (const value of [row.case_id, row.cohort, row.mode]) {
      const td = document.createElement("td");
      td.appendChild(text(value));
      tr.appendChild(td);
    }
    const verdict = document.createElement("td");
    verdict.appendChild(verdictCell(row.verdict));
    tr.appendChild(verdict);
    for (const value of [row.selector, row.model_calls, row.wall_clock_seconds]) {
      const td = document.createElement("td");
      td.appendChild(text(value));
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }

  const checks = document.querySelector("#checks tbody");
  for (const check of data.checks) {
    const tr = document.createElement("tr");
    for (const value of [check.id, check.passed ? "yes" : "no", check.detail]) {
      const td = document.createElement("td");
      td.appendChild(text(value));
      tr.appendChild(td);
    }
    checks.appendChild(tr);
  }

  const notes = document.querySelector("#notes");
  const heading = document.createElement("h2");
  heading.appendChild(text("How to read this"));
  const list = document.createElement("ul");
  for (const note of data.notes) {
    const item = document.createElement("li");
    item.appendChild(text(note));
    list.appendChild(item);
  }
  notes.append(heading, list);
}
