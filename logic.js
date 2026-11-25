/* Logique partagée entre la page et le service worker (notifications). */
(function (g) {
  const RANK = { red: 0, orange: 1, yellow: 2, white: 3 };
  const ICON = { red: '🔴', orange: '🟠', yellow: '🟡', white: '⚪' };

  // Ancien format (t.date) -> nouveau (t.slots = jours de travail, t.needs = besoins)
  function migrate(st) {
    st.tasks = st.tasks || []; st.waits = st.waits || [];
    for (const t of st.tasks) {
      if (!Array.isArray(t.slots)) {
        t.slots = [{ d: t.date || null, ok: t.status === 'done', o: t.order || 0 }];
        delete t.date; delete t.order;
      }
      if (!t.slots.length) t.slots.push({ d: null, ok: false, o: 0 });
      if (!Array.isArray(t.needs)) t.needs = [];
    }
    return st;
  }

  function summary(st, today) {
    migrate(st);
    const act = st.tasks.filter(x => x.status === 'todo' || x.status === 'blocked');
    const sort = (a, b) => RANK[a.prio] - RANK[b.prio];
    const late = act.filter(x => x.slots.some(s => s.d && s.d < today && !s.ok)).sort(sort);
    const tod = act.filter(x => x.slots.some(s => s.d === today && !s.ok)).sort(sort);
    const arr = st.waits.filter(w => w.date && w.date <= today);
    const needT = act.filter(x => x.needs.some(n => !n.ok)).sort(sort);
    const nNeeds = needT.reduce((k, x) => k + x.needs.filter(n => !n.ok).length, 0);
    const ic = x => x.status === 'blocked' ? '🟣' : (ICON[x.prio] || '•');
    const lines = [], parts = [];
    if (late.length) lines.push(`⚠ En retard : ${late.map(x => ic(x) + ' ' + x.title).join(', ')}`);
    if (tod.length) lines.push(`📌 Aujourd'hui : ${tod.map(x => ic(x) + ' ' + x.title).join(', ')}`);
    if (arr.length) lines.push(`📦 Attendu : ${arr.map(w => w.title).join(', ')}`);
    if (needT.length) lines.push(`🛒 Besoins : ${needT.map(x => x.needs.filter(n => !n.ok).map(n => n.text).join(', ') + ' (' + x.title + ')').join(' · ')}`);
    if (tod.length) parts.push(`${tod.length} aujourd'hui`);
    if (late.length) parts.push(`${late.length} en retard`);
    if (arr.length) parts.push(`${arr.length} colis`);
    if (nNeeds) parts.push(`${nNeeds} besoin${nNeeds > 1 ? 's' : ''}`);
    return {
      count: late.length + tod.length + arr.length + needT.length,
      title: parts.length ? 'Planning · ' + parts.join(' · ') : 'Planning',
      body: lines.join('\n')
    };
  }

  g.PlanningLogic = { migrate, summary, RANK };
})(self);
