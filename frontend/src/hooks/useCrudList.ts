import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * Facteur commun aux pages admin de type liste/formulaire/tableau (Examens, Méditations...) :
 * chacune réimplémentait indépendamment le même trio load-via-GET / create-via-POST-puis-reload
 * / delete-via-DELETE-puis-reload. Les actions spécifiques à une page (édition, changement de
 * rôle, bascule d'état...) restent dans le composant, au-dessus de ce socle.
 */
export function useCrudList<T>(endpoint: string) {
  const [items, setItems] = useState<T[]>([]);

  const load = useCallback(() => {
    api.get<T[]>(endpoint).then((res) => setItems(res.data));
  }, [endpoint]);

  useEffect(load, [load]);

  async function create(payload: unknown) {
    await api.post(endpoint, payload);
    load();
  }

  async function update(id: string, payload: unknown) {
    await api.put(`${endpoint}/${id}`, payload);
    load();
  }

  async function remove(id: string) {
    await api.delete(`${endpoint}/${id}`);
    load();
  }

  return { items, setItems, load, create, update, remove };
}
