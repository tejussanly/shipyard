// Shipyard — the DevOps roadmap, drawn with React Flow.
// Plain JavaScript (React.createElement), so no build step is needed.

import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, Background, Controls, Handle, Position, MarkerType } from '@xyflow/react';
import { TOPICS, TOPIC_BY_ID, topicStatus } from './data.js';
import { getProgress } from './site.js';

const h = React.createElement;

// One box on the map
function TopicNode({ data }) {
  const { topic, status } = data;
  const note = status === 'done' ? 'Loaded ✓'
    : status === 'open' ? 'Ready to load'
    : `Needs ${topic.needs.map((n) => TOPIC_BY_ID[n].code).join(' + ')}`;
  return h('div', { className: `tnode tnode-${status}` },
    h(Handle, { type: 'target', position: Position.Left }),
    h('span', { className: 'code' }, topic.code),
    h('div', null, h('b', null, topic.title), h('small', null, note)),
    h(Handle, { type: 'source', position: Position.Right }),
  );
}
const nodeTypes = { topic: TopicNode };

function Roadmap() {
  const [done, setDone] = useState(getProgress().done);

  // Re-draw if progress changes (e.g. reset from the footer)
  useEffect(() => {
    const on = (e) => setDone({ ...e.detail.done });
    window.addEventListener('progress', on);
    return () => window.removeEventListener('progress', on);
  }, []);

  const nodes = useMemo(() => TOPICS.map((t) => ({
    id: t.id,
    type: 'topic',
    position: { x: t.col * 300, y: t.row * 120 },
    data: { topic: t, status: topicStatus(t, done) },
  })), [done]);

  const edges = useMemo(() => TOPICS.flatMap((t) => t.needs.map((n) => ({
    id: `${n}->${t.id}`,
    source: n,
    target: t.id,
    animated: !!done[n] && !done[t.id],
    className: done[n] ? 'e-done' : 'e-todo',
    markerEnd: { type: MarkerType.ArrowClosed, color: done[n] ? '#06222e' : '#8fb3c0' },
  }))), [done]);

  return h(ReactFlow, {
    nodes,
    edges,
    nodeTypes,
    onNodeClick: (_, n) => { window.location.href = `topics/${n.id}.html`; },
    nodesDraggable: false,
    nodesConnectable: false,
    elementsSelectable: false,
    fitView: true,
    fitViewOptions: { padding: 0.15 },
    minZoom: 0.3,
  },
  h(Background, { gap: 24, color: '#b9d9e4' }),
  h(Controls, { showInteractive: false }));
}

createRoot(document.getElementById('roadmap')).render(h(Roadmap));
