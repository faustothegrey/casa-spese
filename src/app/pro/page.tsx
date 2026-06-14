"use client";

import { useEffect, useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

interface Transaction {
  dataContabile: string;
  dataValuta: string;
  descrizione: string;
  importo: number;
  saldo: number | null;
}



function formatCurrency(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const [d, m, y] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export default function ProPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/transactions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.transactions) setTransactions(data.transactions);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const expenses = transactions.filter((t) => t.importo < 0);
    const incomes = transactions.filter((t) => t.importo > 0);
    const totalExpenses = expenses.reduce((s, t) => s + t.importo, 0);
    const totalIncome = incomes.reduce((s, t) => s + t.importo, 0);
    return {
      count: transactions.length,
      totalExpenses,
      totalIncome,
      net: totalIncome + totalExpenses,
    };
  }, [transactions]);

  const balanceData = useMemo(() => {
    return [...transactions]
      .filter((t) => t.saldo !== null)
      .reverse()
      .map((t) => ({
        date: formatDate(t.dataContabile),
        saldo: t.saldo,
      }));
  }, [transactions]);

  const dailySpending = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.importo < 0) {
        const key = t.dataContabile;
        map.set(key, (map.get(key) || 0) + Math.abs(t.importo));
      }
    }
    return [...map.entries()]
      .sort((a, b) => {
        const [da, ma, ya] = a[0].split("-").map(Number);
        const [db, mb, yb] = b[0].split("-").map(Number);
        return ya * 10000 + ma * 100 + da - (yb * 10000 + mb * 100 + db);
      })
      .map(([date, amount]) => ({
        date: formatDate(date),
        amount: Math.round(amount * 100) / 100,
      }));
  }, [transactions]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-gray-500">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Casa Spese Pro</h1>
      <p className="text-gray-500 mb-6">Statistiche e grafici</p>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <p className="text-sm text-gray-500">Movimenti</p>
          <p className="text-2xl font-semibold text-gray-900">{stats.count}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <p className="text-sm text-gray-500">Totale Entrate</p>
          <p className="text-2xl font-semibold text-green-600">
            {formatCurrency(stats.totalIncome)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <p className="text-sm text-gray-500">Totale Uscite</p>
          <p className="text-2xl font-semibold text-red-600">
            {formatCurrency(stats.totalExpenses)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <p className="text-sm text-gray-500">Netto</p>
          <p
            className={`text-2xl font-semibold ${stats.net >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {formatCurrency(stats.net)}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Andamento Saldo
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={balanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value)), "Saldo"]}
              />
              <Area
                type="monotone"
                dataKey="saldo"
                stroke="#3b82f6"
                fill="#93c5fd"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Spese Giornaliere
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailySpending}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value)), "Spesa"]}
              />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {dailySpending.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.amount > 100 ? "#ef4444" : "#f97316"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
