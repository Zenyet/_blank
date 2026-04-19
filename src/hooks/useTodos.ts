import { useCallback, useEffect, useState } from 'react';
import type { Todo } from '../types';
import { SEED_TODOS } from '../data/todos';
import { loadTodosRaw, saveTodosRaw } from '../services/chromeApi';

export function useTodos(): {
  todos: Todo[];
  toggle: (id: string) => void;
  add: (text: string, tag?: Todo['tag']) => void;
  remove: (id: string) => void;
} {
  const [todos, setTodos] = useState<Todo[]>(SEED_TODOS);

  useEffect(() => {
    loadTodosRaw<Todo[]>(SEED_TODOS).then(setTodos);
  }, []);

  const toggle = useCallback((id: string) => {
    setTodos((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
      void saveTodosRaw(next);
      return next;
    });
  }, []);

  const add = useCallback((text: string, tag: Todo['tag'] = 'work') => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTodos((prev) => {
      const next: Todo[] = [
        ...prev,
        { id: `t-${Date.now()}`, done: false, text: trimmed, tag },
      ];
      void saveTodosRaw(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setTodos((prev) => {
      const next = prev.filter((t) => t.id !== id);
      void saveTodosRaw(next);
      return next;
    });
  }, []);

  return { todos, toggle, add, remove };
}
