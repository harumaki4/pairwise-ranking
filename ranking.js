/**
 * ranking.js
 * ペアワイズ比較のランキング算出（Bradley-Terryモデル + MAP正則化）
 * および偏りを抑えた次の比較ペア選択ロジック
 */
(function (global) {
  'use strict';

  /**
   * Bradley-Terryモデル（MMアルゴリズム + ベイズ事前分布）によるスコア算出
   *
   * @param {Array<Object>} items - [{ id, name, ... }]
   * @param {Array<Object>} comparisons - [{ leftId, rightId, result: 'left'|'right'|'draw' }]
   * @param {Object} options - { priorStrength: 0.5, maxIter: 200, tol: 1e-7 }
   * @returns {Array<Object>} ランキング順にソートされた配列
   */
  function calculateBradleyTerry(items, comparisons, options = {}) {
    const priorStrength = options.priorStrength ?? 0.5; // 仮想相手(π=1)との擬似引き分け回数
    const maxIter = options.maxIter ?? 200;
    const tol = options.tol ?? 1e-7;

    if (!items || items.length === 0) return [];

    const n = items.length;
    const idToIndex = new Map();
    items.forEach((item, idx) => idToIndex.set(item.id, idx));

    // 勝敗・引き分け集計
    const wins = new Float64Array(n);     // 勝利数（引き分けは0.5加算）
    const losses = new Float64Array(n);   // 敗北数（引き分けは0.5加算）
    const rawWins = new Int32Array(n);
    const rawLosses = new Int32Array(n);
    const rawDraws = new Int32Array(n);
    const counts = new Int32Array(n);     // 総比較回数

    // ペアごとの対戦回数行列 n_ij
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

    // 強さパラメータ pi (初期値 1.0)
    let pi = new Float64Array(n).fill(1.0);

    // MM (Minorization-Maximization) アルゴリズムによる反復更新
    // 事前分布: 強さ 1.0 の仮想アンカーと priorStrength 回の引き分け（勝利 0.5*priorStrength, 対戦 priorStrength）
    for (let iter = 0; iter < maxIter; iter++) {
      const nextPi = new Float64Array(n);
      let maxDiff = 0;

      for (let i = 0; i < n; i++) {
        // 分子: 実勝利数(同点0.5含む) + 事前分布の擬似勝利
        const numerator = wins[i] + 0.5 * priorStrength;

        // 分母: Σ_{j≠i} (n_ij / (π_i + π_j)) + priorStrength / (π_i + 1.0)
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

      // 幾何平均が1になるよう正規化（スケールドリフト防止）
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

    // 結果の構築
    const results = items.map((item, i) => {
      // 平均的な商品(π=1)に対する期待勝率を0〜100スコア化
      const expectedWinProb = pi[i] / (pi[i] + 1.0);
      const score = Math.round(expectedWinProb * 1000) / 10; // 小数第1位

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

    // ソート規則:
    // 1. 比較済み商品を未比較商品より優先表示するか、スコア順にするか：
    //    未比較(50.0)が負けた商品(50未満)より上に来るのは自然なためスコア降順を基本とし、
    //    同スコア時は比較回数が多い順、さらに同じなら登録順を維持
    results.sort((a, b) => {
      if (Math.abs(b.pi - a.pi) > 1e-6) {
        return b.pi - a.pi;
      }
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return 0;
    });

    // 同順位判定
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

  /**
   * 比較回数の偏りを抑えた次の比較ペアを選択する
   *
   * 戦略:
   * 1. 最も比較回数が少ない商品（特に未比較=0回の商品）を優先的に選出する
   * 2. 対戦相手は「まだ対戦していないペア」を最優先し、その中でも
   *    - 相手自身の比較回数が少ない
   *    - または現在の推定強さ(pi)が近い（順位の境界を精密化する）
   *    ペアを高スコアで選択する
   * 3. 直前にスキップ・比較したばかりの同一ペアは回避する
   *
   * @param {Array<Object>} items
   * @param {Array<Object>} comparisons
   * @param {Object} options - { excludePairKey: string|null, currentRankings: Array|null }
   * @returns {Object|null} { left, right }
   */
  function selectNextPair(items, comparisons, options = {}) {
    if (!items || items.length < 2) return null;

    const excludePairKey = options.excludePairKey || null;
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

    // 現在の強さ推定値（情報がなければ1.0）
    const piMap = new Map();
    if (options.currentRankings) {
      options.currentRankings.forEach((r) => piMap.set(r.item.id, r.pi));
    }

    // 全ペア候補を生成して優先度スコアを算出
    const candidates = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = items[i];
        const b = items[j];
        const key = makeKey(a.id, b.id);
        const pCount = pairCount.get(key) || 0;

        // 優先度計算（小さいほど優先）
        // 1. ペアの既対戦回数（未対戦ペアを最優先: 0 vs 1+）
        // 2. 両者の総比較回数の合計（比較が少ない商品を底上げ）
        // 3. 両者の比較回数の最小値（未比較0回の商品を確実に拾う）
        // 4. 強さの差（近い実力同士の対決を優先して順位精度を上げる）
        const minItemCount = Math.min(counts[i], counts[j]);
        const sumItemCount = counts[i] + counts[j];

        const piA = piMap.get(a.id) || 1.0;
        const piB = piMap.get(b.id) || 1.0;
        const skillDiff = Math.abs(Math.log(piA) - Math.log(piB));

        // わずかなランダム性を加えて単調さを防ぐ
        const jitter = Math.random() * 0.35;

        const priorityCost =
          pCount * 100 +
          minItemCount * 15 +
          sumItemCount * 4 +
          skillDiff * 1.5 +
          jitter;

        candidates.push({ a, b, key, priorityCost });
      }
    }

    candidates.sort((x, y) => x.priorityCost - y.priorityCost);

    // 除外ペア（直前と同じ組み合わせ等）があれば2番目以降を優先
    let chosen = candidates[0];
    if (excludePairKey && candidates.length > 1 && chosen.key === excludePairKey) {
      chosen = candidates[1];
    }

    // 左右の表示バイアスを防ぐため50%の確率で左右を入れ替え
    if (Math.random() < 0.5) {
      return { left: chosen.a, right: chosen.b };
    } else {
      return { left: chosen.b, right: chosen.a };
    }
  }

  const RankingEngine = {
    calculateBradleyTerry,
    selectNextPair
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RankingEngine;
  } else {
    global.RankingEngine = RankingEngine;
  }
})(typeof window !== 'undefined' ? window : globalThis);
