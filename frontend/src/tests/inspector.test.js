import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Repository Explorer Search & Filter Logic', () => {
  const mockFiles = [
    {
      path: 'src/main.tsx',
      name: 'main.tsx',
      language: 'TypeScript',
      category: 'entrypoint',
      symbols: ['createRoot', 'App']
    },
    {
      path: 'src/components/UserCard.tsx',
      name: 'UserCard.tsx',
      language: 'TypeScript',
      category: 'frontend-component',
      symbols: ['UserCard', 'useUserStatus']
    },
    {
      path: 'src/services/authService.ts',
      name: 'authService.ts',
      language: 'TypeScript',
      category: 'service',
      symbols: ['login', 'logout', 'getToken']
    },
    {
      path: 'routes/api.py',
      name: 'api.py',
      language: 'Python',
      category: 'backend-route',
      symbols: ['get_users', 'create_user']
    },
  ];

  const searchFiles = (files, query) => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter(f =>
      f.path.toLowerCase().includes(q) ||
      f.name.toLowerCase().includes(q) ||
      (f.category || '').toLowerCase().includes(q) ||
      (f.symbols || []).some(s => s.toLowerCase().includes(q))
    );
  };

  const filterFiles = (files, { language = 'all', category = 'all' }) => {
    return files.filter(f => {
      if (language !== 'all' && f.language !== language) return false;
      if (category !== 'all' && f.category !== category) return false;
      return true;
    });
  };

  it('searches files by filename', () => {
    const results = searchFiles(mockFiles, 'UserCard');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'UserCard.tsx');
  });

  it('searches files by symbol name', () => {
    const results = searchFiles(mockFiles, 'useUserStatus');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'UserCard.tsx');
  });

  it('searches files by category keyword', () => {
    const results = searchFiles(mockFiles, 'service');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'authService.ts');
  });

  it('filters files by language', () => {
    const pyResults = filterFiles(mockFiles, { language: 'Python' });
    assert.strictEqual(pyResults.length, 1);
    assert.strictEqual(pyResults[0].name, 'api.py');

    const tsResults = filterFiles(mockFiles, { language: 'TypeScript' });
    assert.strictEqual(tsResults.length, 3);
  });

  it('filters files by architectural category', () => {
    const results = filterFiles(mockFiles, { category: 'frontend-component' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'UserCard.tsx');
  });
});

describe('File Inspector Navigation History Stack', () => {
  class NavigationHistory {
    constructor(initial) {
      this.stack = initial ? [initial] : [];
      this.index = initial ? 0 : -1;
    }

    push(path) {
      this.stack = this.stack.slice(0, this.index + 1).concat(path);
      this.index = this.stack.length - 1;
    }

    back() {
      if (this.index > 0) {
        this.index -= 1;
        return this.stack[this.index];
      }
      return null;
    }

    forward() {
      if (this.index < this.stack.length - 1) {
        this.index += 1;
        return this.stack[this.index];
      }
      return null;
    }

    current() {
      return this.index >= 0 ? this.stack[this.index] : null;
    }
  }

  it('tracks sequential file selection and back/forward navigation', () => {
    const nav = new NavigationHistory('src/main.tsx');
    assert.strictEqual(nav.current(), 'src/main.tsx');

    // User navigates from main.tsx -> UserCard.tsx -> authService.ts
    nav.push('src/components/UserCard.tsx');
    nav.push('src/services/authService.ts');
    assert.strictEqual(nav.current(), 'src/services/authService.ts');

    // Click Back
    const back1 = nav.back();
    assert.strictEqual(back1, 'src/components/UserCard.tsx');

    const back2 = nav.back();
    assert.strictEqual(back2, 'src/main.tsx');

    // Cannot go back further
    assert.strictEqual(nav.back(), null);
    assert.strictEqual(nav.current(), 'src/main.tsx');

    // Click Forward
    const fwd1 = nav.forward();
    assert.strictEqual(fwd1, 'src/components/UserCard.tsx');

    // Branching forward stack on new selection
    nav.push('routes/api.py');
    assert.strictEqual(nav.current(), 'routes/api.py');
    assert.strictEqual(nav.forward(), null); // forward history pruned on new push
  });
});
