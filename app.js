/**
 * app.js
 * UI制御・状態管理・localStorage永続化・JSONバックアップ/復元・PDFデータ一括追加
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'pairwise_product_ranking_v1';

  // desk_speakers_grouped_specs (1).pdf に記載のスピーカー群（グループA〜D / 12機種）
  const DESK_SPEAKER_BULK_ITEMS = [
    {
      name: 'Polk Signature Elite ES10',
      price: null,
      category: 'デスクスピーカー / グループA',
      memo: '2.1/3.0系 / 80 Hz-40 kHz / 84 dB / 4-8Ω / 100 mm / 25 mm'
    },
    {
      name: 'DALI SPEKTOR 1',
      price: null,
      category: 'デスクスピーカー / グループA',
      memo: '4.8系 / 59 Hz-26 kHz / 83 dB / 6Ω / 114 mm / 21 mm'
    },
    {
      name: 'DALI KUPID',
      price: null,
      category: 'デスクスピーカー / グループA',
      memo: '4.9系 / 63 Hz-25 kHz / 83 dB / 4Ω / 114 mm / 26 mm'
    },
    {
      name: 'Wharfedale DIAMOND 12.0i',
      price: null,
      category: 'デスクスピーカー / グループA',
      memo: '70 Hz - 20 kHz / 87 dB / 4Ω / 100 mm / 25 mm'
    },
    {
      name: 'DALI OPTICON 1 Mk2',
      price: null,
      category: 'デスクスピーカー / グループB',
      memo: '11.9系 / 62 Hz-25 kHz / 85 dB / 4Ω / 120 mm / 29 mm'
    },
    {
      name: 'DALI OBERON 1',
      price: null,
      category: 'デスクスピーカー / グループB',
      memo: '5.9/7.5系 / 51 Hz-26 kHz / 86 dB / 6Ω / 133 mm / 29 mm'
    },
    {
      name: 'DALI SONIK 1',
      price: null,
      category: 'デスクスピーカー / グループB',
      memo: '6.7/9.0系 / 50 Hz-26 kHz / 86 dB / 6Ω / 130 mm / 29 mm'
    },
    {
      name: 'B&W 607 S3',
      price: null,
      category: 'デスクスピーカー / グループB',
      memo: '10.7/11.3系 / 52 Hz-28 kHz / 84 dB / 8Ω(3.0) / 130 mm / 25 mm'
    },
    {
      name: 'DALI SPEKTOR 2',
      price: null,
      category: 'デスクスピーカー / グループB',
      memo: '5.9系 / 54 Hz-26 kHz / 84.5 dB / 6Ω / 133 mm / 25 mm'
    },
    {
      name: 'KEF Q1 Meta',
      price: null,
      category: 'デスクスピーカー / グループB',
      memo: '7.9/8.8系 / 51 Hz-20 kHz / 86 dB / 4Ω(3.2) / 130 mm Uni-Q / 25 mm'
    },
    {
      name: 'Polk Signature Elite ES15',
      price: null,
      category: 'デスクスピーカー / グループB',
      memo: '4.6系 / 48 Hz - 40 kHz / 85 dB / 8Ω / 133 mm / 25 mm'
    },
    {
      name: 'Wharfedale DIAMOND 12.1',
      price: null,
      category: 'デスクスピーカー / グループC',
      memo: '5.0系 / 65 Hz-20 kHz / 88 dB / 4Ω / 130 mm / 25 mm'
    }
  ];

  let state = {
    items: [],
    comparisons: []
  };

  let currentPair = null;
  let lastPairKey = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.items) && Array.isArray(parsed.comparisons)) {
        state.items = parsed.items;
        const validIds = new Set(state.items.map((item) => item.id));
        state.comparisons = parsed.comparisons.filter(
          (c) => validIds.has(c.leftId) && validIds.has(c.rightId) && c.leftId !== c.rightId
        );
      }
    } catch (err) {
      console.error('データの読み込みに失敗しました:', err);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      alert('ブラウザへのデータ保存に失敗しました。JSONバックアップを推奨します。');
      console.error(err);
    }
  }

  function generateId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function formatPrice(price) {
    if (price === null || price === undefined || price === '') return '価格未設定';
    const num = Number(price);
    if (Number.isNaN(num)) return String(price);
    return `¥${num.toLocaleString('ja-JP')}`;
  }

  function getPairKey(id1, id2) {
    return id1 < id2 ? `${id1}::${id2}` : `${id2}::${id1}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.switchTab = function (tabName) {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      const isTarget = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', String(isTarget));
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });

    if (tabName === 'compare') renderCompareView();
    if (tabName === 'ranking') renderRankingView();
    if (tabName === 'items') renderItemsView();
    if (tabName === 'data') renderDataView();
  };

  function setManualPair(leftId, rightId) {
    if (!leftId || !rightId) return;
    if (leftId === rightId) {
      alert('同じ商品同士は比較できません。別の商品を選んでください。');
      return;
    }
    const itemMap = new Map(state.items.map((item) => [item.id, item]));
    const left = itemMap.get(leftId);
    const right = itemMap.get(rightId);
    if (!left || !right) return;
    currentPair = { left, right };
    renderCompareView();
  }

  function renderPairSelectors(validComparisons) {
    const leftSelect = document.getElementById('select-left-item');
    const rightSelect = document.getElementById('select-right-item');
    const startBtn = document.getElementById('btn-start-manual-pair');
    if (!leftSelect || !rightSelect) return;

    if (!state.items || state.items.length < 2) {
      const emptyOpt = '<option value="">商品を2つ以上登録してください</option>';
      leftSelect.innerHTML = emptyOpt;
      rightSelect.innerHTML = emptyOpt;
      leftSelect.disabled = true;
      rightSelect.disabled = true;
      if (startBtn) startBtn.disabled = true;
      return;
    }

    leftSelect.disabled = false;
    rightSelect.disabled = false;
    if (startBtn) startBtn.disabled = false;

    const countById = new Map();
    validComparisons.forEach((c) => {
      countById.set(c.leftId, (countById.get(c.leftId) || 0) + 1);
      countById.set(c.rightId, (countById.get(c.rightId) || 0) + 1);
    });

    const prevLeft = leftSelect.value;
    const prevRight = rightSelect.value;

    const optionsHtml = state.items
      .map((item) => {
        const cnt = countById.get(item.id) || 0;
        const safeId = String(item.id || '').replace(/"/g, '&quot;');
        return `<option value="${safeId}">${escapeHtml(item.name)}（比較${cnt}回）</option>`;
      })
      .join('');

    leftSelect.innerHTML = optionsHtml;
    rightSelect.innerHTML = optionsHtml;

    const validIdSet = new Set(state.items.map((it) => it.id));
    if (currentPair && validIdSet.has(currentPair.left.id) && validIdSet.has(currentPair.right.id)) {
      leftSelect.value = currentPair.left.id;
      rightSelect.value = currentPair.right.id;
    } else {
      leftSelect.value = validIdSet.has(prevLeft) ? prevLeft : state.items[0].id;
      rightSelect.value = validIdSet.has(prevRight) ? prevRight : state.items[1].id;
    }
  }

  function renderRecommendedBattles(rankings) {
    const container = document.getElementById('recommended-battles-list');
    if (!container) return;

    const recs = window.RankingEngine.getRecommendedBattles(state.items, state.comparisons, {
      limit: 4,
      currentRankings: rankings
    });

    if (recs.length === 0) {
      container.innerHTML = '<p class="box-sub">推奨バトルを表示するには商品を2件以上登録してください。</p>';
      return;
    }

    container.innerHTML = recs
      .map(
        (rec, idx) => `
        <button type="button" class="rec-battle-btn" data-rec-index="${idx}" data-left-id="${escapeHtml(rec.left.id)}" data-right-id="${escapeHtml(rec.right.id)}">
          <span class="rec-meta">${escapeHtml(rec.reason)}</span>
          <span class="rec-matchup">${escapeHtml(rec.left.name)} <small>vs</small> ${escapeHtml(rec.right.name)}</span>
          <span class="rec-sub">対戦履歴: ${rec.pairCount}回 / 最小比較数: ${rec.minCount}回</span>
        </button>
      `
      )
      .join('');
  }

  function pickNextPair(forceDifferent = false) {
    if (state.items.length < 2) {
      currentPair = null;
      return;
    }
    const rankings = window.RankingEngine.calculateBradleyTerry(state.items, state.comparisons);
    const excludeKey = forceDifferent && currentPair
      ? getPairKey(currentPair.left.id, currentPair.right.id)
      : lastPairKey;

    currentPair = window.RankingEngine.selectNextPair(state.items, state.comparisons, {
      excludePairKey: excludeKey,
      currentRankings: rankings
    });
  }

  function renderCompareView() {
    const n = state.items.length;
    const validComparisons = state.comparisons.filter((c) => c.result !== 'skip');
    const totalPossiblePairs = n >= 2 ? (n * (n - 1)) / 2 : 0;

    document.getElementById('compare-progress-text').textContent =
      `比較回数: ${validComparisons.length}回 / 全ペア網羅目安: ${totalPossiblePairs}回`;

    const emptyEl = document.getElementById('compare-empty-state');
    const arenaEl = document.getElementById('compare-arena');

    if (n < 2) {
      emptyEl.classList.remove('hidden');
      arenaEl.classList.add('hidden');
      currentPair = null;
      return;
    }

    emptyEl.classList.add('hidden');
    arenaEl.classList.remove('hidden');

    const itemMap = new Map(state.items.map((item) => [item.id, item]));
    if (
      !currentPair ||
      !itemMap.has(currentPair.left.id) ||
      !itemMap.has(currentPair.right.id) ||
      currentPair.left.id === currentPair.right.id
    ) {
      pickNextPair(false);
    } else {
      currentPair.left = itemMap.get(currentPair.left.id);
      currentPair.right = itemMap.get(currentPair.right.id);
    }

    if (!currentPair) return;

    const countById = new Map();
    validComparisons.forEach((c) => {
      countById.set(c.leftId, (countById.get(c.leftId) || 0) + 1);
      countById.set(c.rightId, (countById.get(c.rightId) || 0) + 1);
    });

    const left = currentPair.left;
    const right = currentPair.right;

    document.getElementById('left-name').textContent = left.name;
    document.getElementById('left-price').textContent = formatPrice(left.price);
    document.getElementById('left-category').textContent = left.category || '';
    document.getElementById('left-memo').textContent = left.memo || '（メモなし）';
    document.getElementById('left-stats').textContent = `これまでの比較: ${countById.get(left.id) || 0}回`;

    document.getElementById('right-name').textContent = right.name;
    document.getElementById('right-price').textContent = formatPrice(right.price);
    document.getElementById('right-category').textContent = right.category || '';
    document.getElementById('right-memo').textContent = right.memo || '（メモなし）';
    document.getElementById('right-stats').textContent = `これまでの比較: ${countById.get(right.id) || 0}回`;

    const rankings = window.RankingEngine.calculateBradleyTerry(state.items, state.comparisons);
    renderPairSelectors(validComparisons);
    renderRecommendedBattles(rankings);
  }

  function recordComparison(result) {
    if (!currentPair) return;

    const record = {
      id: generateId('cmp'),
      leftId: currentPair.left.id,
      rightId: currentPair.right.id,
      result,
      timestamp: new Date().toISOString()
    };

    if (result !== 'skip') {
      state.comparisons.push(record);
      saveState();

      const banner = document.getElementById('last-action-banner');
      const textEl = document.getElementById('last-action-text');
      const label =
        result === 'left'
          ? `「${currentPair.left.name}」の勝ちを記録`
          : result === 'right'
          ? `「${currentPair.right.name}」の勝ちを記録`
          : `「${currentPair.left.name}」と「${currentPair.right.name}」の同等を記録`;
      textEl.textContent = label;
      banner.classList.remove('hidden');
    }

    lastPairKey = getPairKey(currentPair.left.id, currentPair.right.id);
    pickNextPair(true);
    renderCompareView();
  }

  function undoLastComparison() {
    if (state.comparisons.length === 0) return;
    const removed = state.comparisons.pop();
    saveState();

    const itemMap = new Map(state.items.map((item) => [item.id, item]));
    if (itemMap.has(removed.leftId) && itemMap.has(removed.rightId)) {
      currentPair = {
        left: itemMap.get(removed.leftId),
        right: itemMap.get(removed.rightId)
      };
    }
    document.getElementById('last-action-banner').classList.add('hidden');
    renderCompareView();
  }

  function renderRankingView() {
    const emptyEl = document.getElementById('ranking-empty-state');
    const tableWrap = document.getElementById('ranking-table-wrapper');
    const noticeEl = document.getElementById('ranking-notice');
    const tbody = document.getElementById('ranking-tbody');

    if (state.items.length === 0) {
      emptyEl.classList.remove('hidden');
      tableWrap.classList.add('hidden');
      noticeEl.classList.add('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    tableWrap.classList.remove('hidden');

    const rankings = window.RankingEngine.calculateBradleyTerry(state.items, state.comparisons);
    const uncomparedCount = rankings.filter((r) => r.count === 0).length;
    const lowConfCount = rankings.filter((r) => r.count > 0 && r.count < 3).length;

    if (uncomparedCount > 0 || lowConfCount > 0) {
      const msgs = [];
      if (uncomparedCount > 0) msgs.push(`未比較の商品が ${uncomparedCount}件 あります（初期スコア 50.0 で表示）`);
      if (lowConfCount > 0) msgs.push(`比較3回未満の暫定順位商品が ${lowConfCount}件 あります`);
      noticeEl.textContent = `※ ${msgs.join('。')}。比較を進めると順位の精度が上がります。`;
      noticeEl.classList.remove('hidden');
    } else {
      noticeEl.classList.add('hidden');
    }

    tbody.innerHTML = rankings
      .map((r) => {
        const rankClass = r.rank <= 3 && r.count > 0 ? `rank-${r.rank}` : '';
        return `
          <tr>
            <td class="rank-num ${rankClass}">${r.rank}</td>
            <td>
              <strong>${escapeHtml(r.item.name)}</strong><br>
              <small style="color: var(--text-muted);">${formatPrice(r.item.price)}${r.item.category ? ' / ' + escapeHtml(r.item.category) : ''}</small>
            </td>
            <td>
              <div class="score-bar-wrap">
                <span class="score-val">${r.score.toFixed(1)}</span>
                <div class="score-bar"><div class="score-bar-fill" style="width: ${Math.min(100, Math.max(0, r.score))}%"></div></div>
              </div>
            </td>
            <td>${r.wins}-${r.losses}-${r.draws} <small>(${r.count}回)</small></td>
            <td><span class="badge-conf conf-${r.confidence}">${r.confidenceLabel}</span></td>
          </tr>
        `;
      })
      .join('');
  }

  function updateBadge() {
    document.getElementById('item-count-badge').textContent = String(state.items.length);
  }

  function renderItemsView() {
    updateBadge();
    const listEl = document.getElementById('items-list');
    if (state.items.length === 0) {
      listEl.innerHTML = '<div class="empty-box"><p>まだ商品が登録されていません。フォームから追加するか、「デスクスピーカー一括追加 (12件)」をお試しください。</p></div>';
      return;
    }

    listEl.innerHTML = state.items
      .map(
        (item) => `
        <div class="item-row-card">
          <div class="item-row-info">
            <h3>${escapeHtml(item.name)}</h3>
            <div class="item-row-meta">${formatPrice(item.price)}${item.category ? ' ・ ' + escapeHtml(item.category) : ''}</div>
            ${item.memo ? `<div class="item-row-memo">${escapeHtml(item.memo)}</div>` : ''}
          </div>
          <div class="item-row-btns">
            <button class="btn-secondary btn-sm" data-action="edit" data-id="${item.id}">編集</button>
            <button class="btn-danger btn-sm" data-action="delete" data-id="${item.id}">削除</button>
          </div>
        </div>
      `
      )
      .join('');
  }

  function resetItemForm() {
    document.getElementById('edit-item-id').value = '';
    document.getElementById('input-name').value = '';
    document.getElementById('input-price').value = '';
    document.getElementById('input-category').value = '';
    document.getElementById('input-memo').value = '';
    document.getElementById('form-title').textContent = '新規商品の登録';
    document.getElementById('btn-save-item').textContent = '登録する';
    document.getElementById('btn-cancel-edit').classList.add('hidden');
  }

  function handleItemFormSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('edit-item-id').value;
    const name = document.getElementById('input-name').value.trim();
    const priceRaw = document.getElementById('input-price').value.trim();
    const category = document.getElementById('input-category').value.trim();
    const memo = document.getElementById('input-memo').value.trim();

    if (!name) return;

    const price = priceRaw === '' ? null : Number(priceRaw);

    if (editId) {
      const target = state.items.find((item) => item.id === editId);
      if (target) {
        target.name = name;
        target.price = price;
        target.category = category;
        target.memo = memo;
      }
    } else {
      state.items.push({
        id: generateId('itm'),
        name,
        price,
        category,
        memo,
        createdAt: new Date().toISOString()
      });
    }

    saveState();
    resetItemForm();
    renderItemsView();
  }

  function startEditItem(id) {
    const item = state.items.find((x) => x.id === id);
    if (!item) return;
    document.getElementById('edit-item-id').value = item.id;
    document.getElementById('input-name').value = item.name;
    document.getElementById('input-price').value = item.price !== null ? item.price : '';
    document.getElementById('input-category').value = item.category || '';
    document.getElementById('input-memo').value = item.memo || '';
    document.getElementById('form-title').textContent = '商品の編集';
    document.getElementById('btn-save-item').textContent = '更新する';
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function deleteItem(id) {
    const item = state.items.find((x) => x.id === id);
    if (!item) return;
    const relatedCount = state.comparisons.filter((c) => c.leftId === id || c.rightId === id).length;
    const msg =
      relatedCount > 0
        ? `「${item.name}」を削除しますか？
関連する比較履歴 ${relatedCount}件 も同時に削除されます。`
        : `「${item.name}」を削除しますか？`;

    if (!confirm(msg)) return;

    state.items = state.items.filter((x) => x.id !== id);
    state.comparisons = state.comparisons.filter((c) => c.leftId !== id && c.rightId !== id);

    if (currentPair && (currentPair.left.id === id || currentPair.right.id === id)) {
      currentPair = null;
    }

    saveState();
    renderItemsView();
  }

  function bulkAddItems(presetList, labelName) {
    const existingNames = new Set(state.items.map((it) => it.name.trim().toLowerCase()));
    let addedCount = 0;
    let skippedCount = 0;

    presetList.forEach((s) => {
      const key = s.name.trim().toLowerCase();
      if (existingNames.has(key)) {
        skippedCount += 1;
        return;
      }
      existingNames.add(key);
      state.items.push({
        id: generateId('itm'),
        name: s.name,
        price: s.price ?? null,
        category: s.category || '',
        memo: s.memo || '',
        createdAt: new Date().toISOString()
      });
      addedCount += 1;
    });

    saveState();
    renderItemsView();
    alert(`${labelName}を ${addedCount}件 追加しました${skippedCount > 0 ? `（重複 ${skippedCount}件 はスキップ）` : ''}。`);
  }

  function addBulkDeskSpeakers() {
    bulkAddItems(DESK_SPEAKER_BULK_ITEMS, 'デスクスピーカー');
  }

  function addSampleItems() {
    const samples = [
      { name: 'Sony WF-1000XM5', price: 33000, category: '完全ワイヤレス', memo: '業界最高クラスノイキャン、軽量小型、LDAC対応' },
      { name: 'Apple AirPods Pro (第2世代)', price: 39800, category: '完全ワイヤレス', memo: 'iPhoneとの連携最強、自然な外音取り込み、空間オーディオ' },
      { name: 'Bose QuietComfort Ultra Earbuds', price: 36000, category: '完全ワイヤレス', memo: '圧倒的な静寂性と重低音、装着感が安定' },
      { name: 'Sennheiser MOMENTUM True Wireless 4', price: 42000, category: '完全ワイヤレス', memo: '解像度の高い高音質、バッテリー最大7.5時間' },
      { name: 'Technics EAH-AZ80', price: 36600, category: '完全ワイヤレス', memo: '3台マルチポイント対応、クリアな通話品質と自然な音場' },
      { name: 'Anker Soundcore Liberty 4 NC', price: 12990, category: '完全ワイヤレス', memo: '高コスパ、最大50時間再生、普段使いに十分なノイキャン' },
      { name: 'JBL TOUR PRO 2', price: 29700, category: '完全ワイヤレス', memo: 'スマートタッチディスプレイ搭載ケース、迫力あるサウンド' },
      { name: 'Audio-Technica ATH-TWX9', price: 31000, category: '完全ワイヤレス', memo: '深紫外線除菌機能付きケース、繊細な中高音' },
      { name: 'Beats Studio Buds +', price: 24800, category: '完全ワイヤレス', memo: 'スケルトンデザイン、Apple/Android両対応のワンタッチ接続' },
      { name: 'Nothing Ear (a)', price: 14800, category: '完全ワイヤレス', memo: '独特のデザイン、軽量でコスパ優秀、ChatGPT連携' }
    ];
    bulkAddItems(samples, 'イヤホンサンプル');
  }

  function renderDataView() {
    const listEl = document.getElementById('history-list');
    const itemMap = new Map(state.items.map((item) => [item.id, item.name]));
    const recent = state.comparisons.slice(-30).reverse();

    if (recent.length === 0) {
      listEl.innerHTML = '<li>比較履歴はまだありません。</li>';
      return;
    }

    listEl.innerHTML = recent
      .map((c) => {
        const leftName = escapeHtml(itemMap.get(c.leftId) || '(削除済み)');
        const rightName = escapeHtml(itemMap.get(c.rightId) || '(削除済み)');
        let outcome = '';
        if (c.result === 'left') outcome = `<strong>${leftName}</strong> ＞ ${rightName}`;
        else if (c.result === 'right') outcome = `${leftName} ＜ <strong>${rightName}</strong>`;
        else outcome = `${leftName} ＝ ${rightName}（同等）`;

        const dateStr = c.timestamp ? new Date(c.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        return `<li><span>${outcome}</span><small style="color: var(--text-muted);">${dateStr}</small></li>`;
      })
      .join('');
  }

  function exportJsonData() {
    const payload = {
      app: 'pairwise-product-ranking',
      version: 1,
      exportedAt: new Date().toISOString(),
      items: state.items,
      comparisons: state.comparisons
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const dateTag = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `product-ranking-backup-${dateTag}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyJsonToClipboard() {
    const payload = {
      app: 'pairwise-product-ranking',
      version: 1,
      exportedAt: new Date().toISOString(),
      items: state.items,
      comparisons: state.comparisons
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(jsonStr);
      alert('バックアップ用JSONをクリップボードにコピーしました。');
    } catch (err) {
      document.getElementById('textarea-import-json').value = jsonStr;
      alert('下のテキスト欄にJSONを出力しました。全選択してコピーしてください。');
    }
  }

  function restoreFromJsonString(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.comparisons)) {
        throw new Error('JSONの形式が正しくありません。');
      }

      const validItems = parsed.items
        .filter((it) => it && typeof it.id === 'string' && typeof it.name === 'string')
        .map((it) => ({
          id: it.id,
          name: it.name,
          price: it.price ?? null,
          category: it.category || '',
          memo: it.memo || '',
          createdAt: it.createdAt || new Date().toISOString()
        }));

      const validIds = new Set(validItems.map((it) => it.id));
      const validComparisons = parsed.comparisons.filter(
        (c) =>
          c &&
          validIds.has(c.leftId) &&
          validIds.has(c.rightId) &&
          c.leftId !== c.rightId &&
          ['left', 'right', 'draw'].includes(c.result)
      );

      state.items = validItems;
      state.comparisons = validComparisons;
      currentPair = null;
      saveState();
      updateBadge();
      renderDataView();
      alert(`復元が完了しました（商品: ${validItems.length}件、比較履歴: ${validComparisons.length}件）。`);
    } catch (err) {
      alert(`復元に失敗しました: ${err.message}`);
    }
  }

  function init() {
    loadState();
    updateBadge();

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => window.switchTab(btn.dataset.tab));
    });

    document.getElementById('btn-win-left').addEventListener('click', () => recordComparison('left'));
    document.getElementById('btn-win-right').addEventListener('click', () => recordComparison('right'));
    document.getElementById('btn-draw').addEventListener('click', () => recordComparison('draw'));
    document.getElementById('btn-skip').addEventListener('click', () => recordComparison('skip'));
    document.getElementById('btn-next-pair').addEventListener('click', () => {
      pickNextPair(true);
      renderCompareView();
    });
    document.getElementById('btn-undo').addEventListener('click', undoLastComparison);

    document.getElementById('btn-start-manual-pair').addEventListener('click', () => {
      const leftId = document.getElementById('select-left-item').value;
      const rightId = document.getElementById('select-right-item').value;
      setManualPair(leftId, rightId);
    });

    document.getElementById('recommended-battles-list').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-left-id][data-right-id]');
      if (!btn) return;
      setManualPair(btn.dataset.leftId, btn.dataset.rightId);
    });

    document.getElementById('item-form').addEventListener('submit', handleItemFormSubmit);
    document.getElementById('btn-cancel-edit').addEventListener('click', resetItemForm);
    document.getElementById('btn-bulk-speakers').addEventListener('click', addBulkDeskSpeakers);
    document.getElementById('btn-load-sample').addEventListener('click', addSampleItems);

    document.getElementById('items-list').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (action === 'edit') startEditItem(id);
      if (action === 'delete') deleteItem(id);
    });

    document.getElementById('btn-export-json').addEventListener('click', exportJsonData);
    document.getElementById('btn-copy-json').addEventListener('click', copyJsonToClipboard);

    document.getElementById('input-import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        restoreFromJsonString(ev.target.result);
        e.target.value = '';
      };
      reader.readAsText(file);
    });

    document.getElementById('btn-import-text').addEventListener('click', () => {
      const txt = document.getElementById('textarea-import-json').value.trim();
      if (!txt) {
        alert('JSONテキストを貼り付けてください。');
        return;
      }
      restoreFromJsonString(txt);
    });

    document.getElementById('btn-clear-history').addEventListener('click', () => {
      if (!confirm('登録商品は残したまま、比較履歴のみをすべてリセットしますか？')) return;
      state.comparisons = [];
      saveState();
      renderDataView();
    });

    document.getElementById('btn-reset-all').addEventListener('click', () => {
      if (!confirm('すべての商品データと比較履歴を完全に削除しますか？この操作は取り消せません。')) return;
      state.items = [];
      state.comparisons = [];
      currentPair = null;
      saveState();
      updateBadge();
      renderDataView();
    });

    renderCompareView();
    renderItemsView();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
