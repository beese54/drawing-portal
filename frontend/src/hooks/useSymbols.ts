import { useState, useEffect, useCallback } from 'react';
import { SymbolMeta } from '../types';
import { symbolsApi } from '../api/client';

export function useSymbols() {
  const [symbols, setSymbols] = useState<SymbolMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSymbols = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await symbolsApi.list();
      setSymbols(res.data.symbols);
    } catch {
      setError('Failed to load symbols');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSymbols();
  }, [fetchSymbols]);

  return { symbols, isLoading, error, refresh: fetchSymbols };
}
