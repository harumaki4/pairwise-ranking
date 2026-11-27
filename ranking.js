/**
 * ranking.js
 * ペアワイズ比較のランキング算出（Bradley-Terryモデル + MAP正則化）
 * および偏りを抑えた次の比較ペア選択・推奨バトル抽出ロジック
 */
(function (global) {
  'use strict';

  function calculateBradleyTerry(items, comparisons, options = {}) {
    const priorStrength = options.priorStrength ?? 0.5;
    const maxIter = options.maxIter ?? 200;
    const tol = options.tol ?? 1e-7;

    if (!items || items.length === 0) return [];

    const n = items.length;
    const idToIndex = new Map();
    items.forEach((item, idx) => idToIndex.set(item.id, idx));

    const wins = new Float64Array(n);
    const losses = new Float64Array(n);
    const rawWins = new Int32Array(n);
    const rawLosses = new Int32Array(n);
    const rawDraws = new Int32Array(n);
    const counts = new Int32Array(n);

    const pairMatches = Array.from({ length: n }, () => new Float64Array(n));

    for (const c of comparisons) {
      if (c.result === 'skip') continue;
      const i = idToIndex.get(c.leftId);
      const j = idToIndex.get(c.rightId);
      if (i === undefined || j === undefined || i === j) continue;

      pairMatches[i][j] += 1;
      pairMatches[j][i] += 1;
      counts[i] += 1;
      counts[j] += 1;

      if (c.result === 'left') {
        wins[i] += 1.0;
        losses[j] += 1.0;
        rawWins[i] += 1;
        rawLosses[j] += 1;
      } else if (c.result === 'right') {
        wins[j] += 1.0;
        losses[i] += 1.0;
        rawWins[j] += 1;
        rawLosses[i] += 1;
      } else if (c.result === 'draw') {
        wins[i] += 0.5;
        wins[j] += 0.5;
        losses[i] += 0.5;
        losses[j] += 0.5;
        rawDraws[i] += 1;
        rawDraws[j] += 1;
      }
    }

    let pi = new Float64Array(n).fill(1.0);

    for (let iter = 0; iter < maxIter; iter++) {
      const nextPi = new Float64Array(n);
      let maxDiff = 0;

      for (let i = 0; i < n; i++) {
        const numerator = wins[i] + 0.5 * priorStrength;
        let denominator = priorStrength / (pi[i] + 1.0);
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const nij = pairMatches[i][j];
          if (nij > 0) {
            denominator += nij / (pi[i] + pi[j]);
          }
        }
        nextPi[i] = numerator / denominator;
      }

      let logSum = 0;
      for (let i = 0; i < n; i++) {
        logSum += Math.log(nextPi[i]);
      }
      const geoMean = Math.exp(logSum / n);
      for (let i = 0; i < n; i++) {
        nextPi[i] /= geoMean;
        const diff = Math.abs(nextPi[i] - pi[i]);
        if (diff > maxDiff) maxDiff = diff;
      }

      pi = nextPi;
      if (maxDiff < tol) break;
    }

    const results = items.map((item, i) => {
      const expectedWinProb = pi[i] / (pi[i] + 1.0);
      const score = Math.round(expectedWinProb * 1000) / 10;

      let confidence = 'none';
      let confidenceLabel = '未比較';
      if (counts[i] >= 5) {
        confidence = 'high';
        confidenceLabel = '高';
      } else if (counts[i] >= 3) {
        confidence = 'mid';
        confidenceLabel = '中';
      } else if (counts[i] >= 1) {
        confidence = 'low';
        confidenceLabel = '暫定';
      }

      return {
        item,
        pi: pi[i],
        score,
        wins: rawWins[i],
        losses: rawLosses[i],
        draws: rawDraws[i],
        count: counts[i],
        confidence,
        confidenceLabel
      };
    });

    results.sort((a, b) => {
      if (Math.abs(b.pi - a.pi) > 1e-6) {
        return b.pi - a.pi;
      }
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return 0;
    });

    let currentRank = 1;
    results.forEach((r, idx) => {
      if (idx > 0) {
        const prev = results[idx - 1];
        const samePi = Math.abs(prev.pi - r.pi) <= 1e-5;
        const sameCount = prev.count === r.count;
        if (!samePi || !sameCount) {
          currentRank = idx + 1;
        }
      }
      r.rank = currentRank;
    });

    return results;
  }

  function rankPairCandidates(items, comparisons, currentRankings = null) {
    if (!items || items.length < 2) return [];
    const n = items.length;
    const idToIndex = new Map();
    items.forEach((item, idx) => idToIndex.set(item.id, idx));

    const counts = new Int32Array(n);
    const pairCount = new Map();
    const makeKey = (id1, id2) => (id1 < id2 ? `${id1}::${id2}` : `${id2}::${id1}`);

    for (const c of comparisons) {
      if (c.result === 'skip') continue;
      const i = idToIndex.get(c.leftId);
      const j = idToIndex.get(c.rightId);
      if (i === undefined || j === undefined || i === j) continue;
      counts[i] += 1;
      counts[j] += 1;
      const key = makeKey(c.leftId, c.rightId);
      pairCount.set(key, (pairCount.get(key) || 0) + 1);
    }

    const piMap = new Map();
    if (currentRankings) {
      currentRankings.forEach((r) => piMap.set(r.item.id, r.pi));
    }

    const candidates = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = items[i];
        const b = items[j];
        const key = makeKey(a.id, b.id);
        const pCount = pairCount.get(key) || 0;
        const minC = Math.min(counts[i], counts[j]);
        const sumC = counts[i] + counts[j];
        const piA = piMap.get(a.id) || 1.0;
        const piB = piMap.get(b.id) || 1.0;
        const skillDiff = Math.abs(Math.log(piA) - Math.log(piB));

        let reason = '比較バランス改善';
        if (counts[i] === 0 && counts[j] === 0) {
          reason = '両方とも未比較・初対戦';
        } else if (minC === 0) {
          reason = '未比較商品を含む優先バトル';
        } else if (pCount === 0 && skillDiff < 0.35) {
          reason = '未対戦×実力接近の注目カード';
        } else if (pCount === 0) {
          reason = 'まだ対戦していないペア';
        } else if (minC <= 2) {
          reason = '比較回数が少ない商品の補強';
        } else if (skillDiff < 0.25) {
          reason = 'スコア接近の接戦カード';
        }

        const baseCost = pCount * 100 + minC * 15 + sumC * 4 + skillDiff * 1.5;

        candidates.push({
          a,
          b,
          key,
          pairCount: pCount,
          minCount: minC,
          sumCount: sumC,
          reason,
          baseCost
        });
      }
    }

    return candidates;
  }

  function selectNextPair(items, comparisons, options = {}) {
    const candidates = rankPairCandidates(items, comparisons, options.currentRankings);
    if (candidates.length === 0) return null;

    const excludePairKey = options.excludePairKey || null;
    const withJitter = candidates
      .map((c) => ({ ...c, priorityCost: c.baseCost + Math.random() * 0.35 }))
      .sort((x, y) => x.priorityCost - y.priorityCost);

    let chosen = withJitter[0];
    if (excludePairKey && withJitter.length > 1 && chosen.key === excludePairKey) {
      chosen = withJitter[1];
    }

    if (Math.random() < 0.5) {
      return { left: chosen.a, right: chosen.b };
    }
    return { left: chosen.b, right: chosen.a };
  }

  function getRecommendedBattles(items, comparisons, options = {}) {
    const limit = options.limit ?? 4;
    const candidates = rankPairCandidates(items, comparisons, options.currentRankings);
    if (candidates.length === 0) return [];

    candidates.sort((x, y) => x.baseCost - y.baseCost);
    return candidates.slice(0, limit).map((c) => ({
      left: c.a,
      right: c.b,
      pairCount: c.pairCount,
      minCount: c.minCount,
      sumCount: c.sumCount,
      reason: c.reason
    }));
  }

  const RankingEngine = {
    calculateBradleyTerry,
    selectNextPair,
    getRecommendedBattles
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RankingEngine;
  } else {
    global.RankingEngine = RankingEngine;
  }
})(typeof window !== 'undefined' ? window : globalThis);
