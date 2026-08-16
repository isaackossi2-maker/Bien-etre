import { useEffect, useState } from "react";
import { api } from "../api/client";

export function useUnreadCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    function load() {
      api.get<{ count: number }>("/messages/unread-count").then((res) => setCount(res.data.count));
    }
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  return count;
}
