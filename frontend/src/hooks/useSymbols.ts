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

  const uploadSymbol = useCallback(async (file: File, name: string) => {
    await symbolsApi.upload(file, name);
    await fetchSymbols();
  }, [fetchSymbols]);

  const renameSymbol = useCallback(async (symbolId: string, name: string) => {
    await symbolsApi.rename(symbolId, name);
    await fetchSymbols();
  }, [fetchSymbols]);

  const deleteSymbol = useCallback(async (symbolId: string) => {
    await symbolsApi.delete(symbolId);
    await fetchSymbols();
  }, [fetchSymbols]);

  return { symbols, isLoading, error, uploadSymbol, renameSymbol, deleteSymbol, refresh: fetchSymbols };
}
