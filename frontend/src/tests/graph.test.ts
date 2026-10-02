import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  computeGraphSummary,
  buildArchitectureLayersGraph,
  buildFilesGraph,
  DEFAULT_GRAPH_FILTERS,
} from '../lib/graphData';

import { applyDagreLayout } from '../lib/graphLayout';

describe('Graph Summary Calculation', () => {
  const mockModel: any = {
    architecture_layers: {
      'UI': ['src/App.tsx', 'src/Button.tsx'],
      'Services': ['src/auth.ts']
    },
    files: {
      'src/App.tsx': { name: 'App.tsx' },
      'src/Button.tsx': { name: 'Button.tsx' },
      'src/auth.ts': { name: 'auth.ts' }
    },
    dependencies: [
      { source: 'src/App.tsx', target: 'src/auth.ts', type: 'component -> service', confidence: 0.95, evidence: 'import' }
    ],
    entry_points: [{ path: 'src/App.tsx', type: 'web-frontend', confidence: 1.0, evidence: 'boot' }],
    api_routes: [{ method: 'GET', path: '/api/login', file: 'src/auth.ts' }],
    database_models: [{ name: 'User', file: 'src/auth.ts' }]
  };

  it('accurately computes summary metrics', () => {
    const summary = computeGraphSummary(mockModel);
    assert.strictEqual(summary.layersCount, 2);
    assert.strictEqual(summary.filesCount, 3);
    assert.strictEqual(summary.dependenciesCount, 1);
    assert.strictEqual(summary.entryPointsCount, 1);
    assert.strictEqual(summary.routesCount, 1);
    assert.strictEqual(summary.modelsCount, 1);
  });
});

describe('Architecture Layers Graph Generation', () => {
  const mockModel: any = {
    architecture_layers: {
      'UI & Components': ['src/components/Card.tsx'],
      'Services': ['src/services/api.ts'],
      'Models': ['src/models/user.ts']
    },
    dependencies: [
      { source: 'src/components/Card.tsx', target: 'src/services/api.ts', type: 'component -> service', confidence: 0.9, evidence: 'test' },
      { source: 'src/services/api.ts', target: 'src/models/user.ts', type: 'service -> model', confidence: 0.9, evidence: 'test' }
    ]
  };

  it('creates layer nodes and aggregates cross-layer dependencies', () => {
    const { nodes, edges } = buildArchitectureLayersGraph(mockModel);
    assert.strictEqual(nodes.length, 3);

    const layerNames = nodes.map(n => (n.data as any).layerName);
    assert.ok(layerNames.includes('UI & Components'));
    assert.ok(layerNames.includes('Services'));
    assert.ok(layerNames.includes('Models'));

    assert.strictEqual(edges.length, 2);
    assert.strictEqual(edges[0].source, 'layer-UI & Components');
    assert.strictEqual(edges[0].target, 'layer-Services');
  });
});

describe('File Graph Generation & Filtering', () => {
  const mockModel: any = {
    architecture_layers: {
      'UI': ['src/Main.tsx', 'src/Card.tsx'],
      'Services': ['src/userService.ts'],
      'Models': ['src/userModel.ts']
    },
    files: {
      'src/Main.tsx': {
        name: 'Main.tsx',
        language: 'TypeScript',
        category: 'entrypoint'
      },
      'src/Card.tsx': {
        name: 'Card.tsx',
        language: 'TypeScript',
        category: 'frontend-component'
      },
      'src/userService.ts': {
        name: 'userService.ts',
        language: 'TypeScript',
        category: 'service'
      },
      'src/userModel.ts': {
        name: 'userModel.ts',
        language: 'TypeScript',
        category: 'model'
      }
    },
    entry_points: [{ path: 'src/Main.tsx', type: 'web-frontend' }],
    api_routes: [{ method: 'GET', path: '/users', file: 'src/userService.ts' }],
    database_models: [{ name: 'User', file: 'src/userModel.ts' }],
    dependencies: [
      { source: 'src/Main.tsx', target: 'src/Card.tsx', type: 'renders', confidence: 0.9, evidence: 'render' },
      { source: 'src/Card.tsx', target: 'src/userService.ts', type: 'component -> service', confidence: 0.95, evidence: 'import' },
      { source: 'src/userService.ts', target: 'src/userModel.ts', type: 'service -> model', confidence: 0.9, evidence: 'import' }
    ]
  };

  it('builds nodes with correct architectural indicators', () => {
    const { nodes, edges } = buildFilesGraph(mockModel, DEFAULT_GRAPH_FILTERS, null);
    assert.strictEqual(nodes.length, 4);
    assert.strictEqual(edges.length, 3);

    const mainNode = nodes.find(n => n.id === 'src/Main.tsx')!;
    assert.ok((mainNode.data as any).isEntryPoint);

    const serviceNode = nodes.find(n => n.id === 'src/userService.ts')!;
    assert.ok((serviceNode.data as any).hasRoutes);

    const modelNode = nodes.find(n => n.id === 'src/userModel.ts')!;
    assert.ok((modelNode.data as any).hasDatabaseModels);
  });

  it('filters file nodes by category', () => {
    const filters = { ...DEFAULT_GRAPH_FILTERS, selectedCategory: 'service' };
    const { nodes } = buildFilesGraph(mockModel, filters, null);
    assert.strictEqual(nodes.length, 1);
    assert.strictEqual(nodes[0].id, 'src/userService.ts');
  });

  it('filters edges by relationship type', () => {
    const filters = { ...DEFAULT_GRAPH_FILTERS, selectedRelationship: 'service -> model' };
    const { edges } = buildFilesGraph(mockModel, filters, null);
    assert.strictEqual(edges.length, 1);
    assert.strictEqual((edges[0].data as any).type, 'service -> model');
  });

  it('applies neighborhood mode around selected file', () => {
    // Focus on Card.tsx: dependencies -> userService.ts, dependents -> Main.tsx
    const filters = {
      ...DEFAULT_GRAPH_FILTERS,
      neighborhoodMode: true,
      neighborhoodDepth: 1 as const
    };
    const { nodes } = buildFilesGraph(mockModel, filters, 'src/Card.tsx');

    const nodeIds = nodes.map(n => n.id);
    assert.strictEqual(nodeIds.length, 3);
    assert.ok(nodeIds.includes('src/Card.tsx'));
    assert.ok(nodeIds.includes('src/Main.tsx')); // dependent
    assert.ok(nodeIds.includes('src/userService.ts')); // dependency
    assert.ok(!nodeIds.includes('src/userModel.ts')); // 2-hop away, excluded in 1-hop
  });

  it('highlights selected node and direct connections', () => {
    const { nodes, edges } = buildFilesGraph(mockModel, DEFAULT_GRAPH_FILTERS, 'src/Card.tsx');

    const cardNode = nodes.find(n => n.id === 'src/Card.tsx')!;
    assert.strictEqual((cardNode.data as any).isSelected, true);

    const serviceNode = nodes.find(n => n.id === 'src/userService.ts')!;
    assert.strictEqual((serviceNode.data as any).isDependency, true);

    const mainNode = nodes.find(n => n.id === 'src/Main.tsx')!;
    assert.strictEqual((mainNode.data as any).isDependent, true);

    const modelNode = nodes.find(n => n.id === 'src/userModel.ts')!;
    assert.strictEqual((modelNode.data as any).isDimmed, true);

    const connectedEdge = edges.find(e => e.id === 'edge-src/Card.tsx->src/userService.ts')!;
    assert.strictEqual((connectedEdge.data as any).isHighlighted, true);
  });
});

describe('Dagre Automatic Layout', () => {
  const nodes = [
    { id: '1', position: { x: 0, y: 0 }, data: {} },
    { id: '2', position: { x: 0, y: 0 }, data: {} },
  ];
  const edges = [
    { id: 'e1', source: '1', target: '2' }
  ];

  it('calculates deterministic coordinates with top-to-bottom flow', () => {
    const { nodes: layouted } = applyDagreLayout(nodes as any, edges as any, 'TB');
    assert.strictEqual(layouted.length, 2);
    // Node 1 should be positioned above Node 2
    assert.ok(layouted[0].position.y < layouted[1].position.y);
    assert.strictEqual(layouted[0].targetPosition, 'top');
    assert.strictEqual(layouted[0].sourcePosition, 'bottom');
  });

  it('calculates deterministic coordinates with left-to-right flow', () => {
    const { nodes: layouted } = applyDagreLayout(nodes as any, edges as any, 'LR');
    assert.strictEqual(layouted.length, 2);
    // Node 1 should be positioned to the left of Node 2
    assert.ok(layouted[0].position.x < layouted[1].position.x);
    assert.strictEqual(layouted[0].targetPosition, 'left');
    assert.strictEqual(layouted[0].sourcePosition, 'right');
  });
});
