// Плагин для соединения двух выделенных объектов коннектором

const MASTER_CONNECTOR_NAME = 'Master Connector';
const STORAGE_KEY = 'masterConnectorId';

const ARROW_MIN_GAP = 64; // минимальный зазор между нодами для прямого крепления

async function main() {

  // Проверяем, что выделено ровно 2 объекта
  const selection = figma.currentPage.selection;
  if (selection.length !== 2) {
    figma.notify('Выберите ровно 2 объекта для соединения');
    figma.closePlugin();
    return;
  }

  // Определяем направление коннектора:
  // Приоритет: более глубоко вложенная нода — всегда start
  // Иначе: нода левее по центру x (при равенстве — выше по y) — start
  const getDepth = (node: SceneNode): number => {
    let depth = 0;
    let cur: BaseNode | null = node.parent;
    while (cur && cur.type !== 'PAGE') { depth++; cur = cur.parent; }
    return depth;
  };
  const s0 = selection[0];
  const s1 = selection[1];
  const depth0 = getDepth(s0);
  const depth1 = getDepth(s1);
  let node1: SceneNode, node2: SceneNode;
  if (depth0 !== depth1) {
    node1 = depth0 > depth1 ? s0 : s1;
    node2 = depth0 > depth1 ? s1 : s0;
  } else {
    const b0 = s0.absoluteBoundingBox;
    const b1 = s1.absoluteBoundingBox;
    const cx0 = b0 ? b0.x + b0.width / 2 : 0;
    const cx1 = b1 ? b1.x + b1.width / 2 : 0;
    const cy0 = b0 ? b0.y + b0.height / 2 : 0;
    const cy1 = b1 ? b1.y + b1.height / 2 : 0;
    const s0IsFirst = cx0 !== cx1 ? cx0 < cx1 : cy0 < cy1;
    node1 = s0IsFirst ? s0 : s1;
    node2 = s0IsFirst ? s1 : s0;
  }

  // Находим общего родителя двух нод — в него будет помещён коннектор
  const getCommonParent = (a: SceneNode, b: SceneNode): BaseNode => {
    const ancestors = new Set<BaseNode>();
    let cur: BaseNode | null = a.parent;
    while (cur) { ancestors.add(cur); cur = cur.parent; }
    let cur2: BaseNode | null = b.parent;
    while (cur2) {
      if (ancestors.has(cur2)) return cur2;
      cur2 = cur2.parent;
    }
    return figma.currentPage;
  };

  // Поднимаемся до прямого ребёнка connectorParent — только к таким нодам можно крепить endpoint
  const getConnectableNode = (node: SceneNode, connectorParent: BaseNode): SceneNode => {
    let current: SceneNode = node;
    while (current.parent && current.parent !== connectorParent) {
      current = current.parent as SceneNode;
    }
    return current;
  };

  // Зазоры между двумя прямоугольниками
  const hGap = (a: Rect, b: Rect) => Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
  const vGap = (a: Rect, b: Rect) => Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);

  // Выбираем сторону крепления на node, смотря в сторону other.
  // Если зазора не хватает по доминирующей оси — используем перпендикулярную.
  const getMagnet = (node: SceneNode, other: SceneNode): 'AUTO' | 'TOP' | 'LEFT' | 'BOTTOM' | 'RIGHT' | 'CENTER' | 'NONE' => {
    const nb = node.absoluteBoundingBox;
    const ob = other.absoluteBoundingBox;
    if (!nb || !ob) return 'AUTO';

    const dx = (ob.x + ob.width / 2) - (nb.x + nb.width / 2);
    const dy = (ob.y + ob.height / 2) - (nb.y + nb.height / 2);
    const nCX = nb.x + nb.width / 2;
    const nCY = nb.y + nb.height / 2;

    // Ближайший край other → ближайший отвечающий край node
    const nearestOtherY = Math.abs(nCY - ob.y) < Math.abs(nCY - (ob.y + ob.height)) ? ob.y : ob.y + ob.height;
    const nearestV = Math.abs(nb.y - nearestOtherY) < Math.abs((nb.y + nb.height) - nearestOtherY) ? 'TOP' : 'BOTTOM';
    const nearestOtherX = Math.abs(nCX - ob.x) < Math.abs(nCX - (ob.x + ob.width)) ? ob.x : ob.x + ob.width;
    const nearestH = Math.abs(nb.x - nearestOtherX) < Math.abs((nb.x + nb.width) - nearestOtherX) ? 'LEFT' : 'RIGHT';

    if (Math.abs(dx) >= Math.abs(dy)) {
      return hGap(nb, ob) >= ARROW_MIN_GAP ? (dx > 0 ? 'RIGHT' : 'LEFT') : nearestV;
    } else {
      return vGap(nb, ob) >= ARROW_MIN_GAP ? (dy > 0 ? 'BOTTOM' : 'TOP') : nearestH;
    }
  };

  // Переводим магнит в абсолютные координаты точки на границе ноды
  const magnetToPoint = (bounds: Rect, magnet: 'AUTO' | 'TOP' | 'LEFT' | 'BOTTOM' | 'RIGHT' | 'CENTER' | 'NONE'): { x: number; y: number } => {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    if (magnet === 'RIGHT')  return { x: bounds.x + bounds.width, y: cy };
    if (magnet === 'LEFT')   return { x: bounds.x, y: cy };
    if (magnet === 'BOTTOM') return { x: cx, y: bounds.y + bounds.height };
    return                          { x: cx, y: bounds.y }; // TOP и остальные
  };

  const makeEndpoint = (node: SceneNode, other: SceneNode, connectorParent: BaseNode): ConnectorEndpoint => {
    const connectable = getConnectableNode(node, connectorParent);
    const magnet = getMagnet(node, other);

    // Если нода уже является прямым ребёнком родителя — крепимся магнитом напрямую
    if (connectable === node) {
      return { endpointNodeId: node.id, magnet };
    }

    // Иначе — крепимся к предку с position, указывающей на нужный край исходной ноды
    const nodeBounds = node.absoluteBoundingBox;
    const connectableBounds = connectable.absoluteBoundingBox;
    if (nodeBounds && connectableBounds) {
      const point = magnetToPoint(nodeBounds, magnet);
      return {
        endpointNodeId: connectable.id,
        position: {
          x: point.x - connectableBounds.x,
          y: point.y - connectableBounds.y
        }
      };
    }
    return { endpointNodeId: connectable.id, magnet: 'AUTO' };
  };

  // Ищем мастер-коннектор: сначала по сохранённому id, затем на Cover, затем на текущей странице
  let connectorLine: ConnectorNode | undefined;
  const savedId = await figma.clientStorage.getAsync(STORAGE_KEY) as string | undefined;
  if (savedId) {
    const node = await figma.getNodeByIdAsync(savedId);
    if (node && node.type === 'CONNECTOR' && node.name === MASTER_CONNECTOR_NAME) {
      connectorLine = node as ConnectorNode;
    }
  }
  if (!connectorLine) {
    const coverPage = figma.root.children.find(p => p.name === 'Cover');
    const searchPages = coverPage
      ? [coverPage, figma.currentPage].filter((p, i, arr) => arr.indexOf(p) === i)
      : [figma.currentPage];
    for (const page of searchPages) {
      if (page !== figma.currentPage) await figma.loadAllPagesAsync();
      const found = page.findAll(
        node => node.name === MASTER_CONNECTOR_NAME && node.type === 'CONNECTOR'
      )[0] as ConnectorNode | undefined;
      if (found) { connectorLine = found; break; }
    }
    if (connectorLine) {
      await figma.clientStorage.setAsync(STORAGE_KEY, connectorLine.id);
    }
  }

  if (!connectorLine) {
    figma.notify('Master Connector не найден на странице');
    figma.closePlugin();
    return;
  }

  // Загружаем все шрифты мастер-коннектора (их может быть несколько при смешанном форматировании)
  const textFont = connectorLine.text.fontName;
  if (textFont !== figma.mixed) {
    await figma.loadFontAsync(textFont);
  } else {
    const len = connectorLine.text.characters.length;
    const seen = new Set<string>();
    for (let i = 0; i < len; i++) {
      const font = connectorLine.text.getRangeFontName(i, i + 1) as FontName;
      const key = `${font.family}::${font.style}`;
      if (!seen.has(key)) {
        seen.add(key);
        await figma.loadFontAsync(font);
      }
    }
  }

  try {
    const absBounds = connectorLine.absoluteBoundingBox;
    if (!absBounds) {
      figma.notify('Не удалось определить координаты коннектора');
      figma.closePlugin();
      return;
    }

    // Сохраняем позицию и родителя мастер-коннектора, чтобы вернуть его на место
    const origRelX = connectorLine.x;
    const origRelY = connectorLine.y;
    const originalParent = connectorLine.parent as ChildrenMixin;

    // Оборачиваем мастер во временный фрейм прямо на его странице
    const frame = figma.createFrame();
    frame.name = 'Connector frame';
    frame.x = absBounds.x;
    frame.y = absBounds.y;
    frame.resize(absBounds.width, absBounds.height);
    originalParent.appendChild(frame);

    connectorLine.x = connectorLine.x - absBounds.x;
    connectorLine.y = connectorLine.y - absBounds.y;
    frame.appendChild(connectorLine);

    // Клонируем фрейм и переносим копию на текущую страницу
    const frameCopy = frame.clone() as FrameNode;
    figma.currentPage.appendChild(frameCopy);

    // Возвращаем мастер-коннектор на исходное место
    connectorLine.x = origRelX;
    connectorLine.y = origRelY;
    originalParent.appendChild(connectorLine);
    frame.remove();

    const connectorInCopy = frameCopy.findAll().find(
      node => node.name === MASTER_CONNECTOR_NAME && node.type === 'CONNECTOR'
    ) as ConnectorNode | undefined;

    let success = false;
    try {
      if (!connectorInCopy) {
        figma.notify('Коннектор не найден в копии фрейма');
      } else {
        const connectorParent = getCommonParent(node1, node2);
        (connectorParent as ChildrenMixin).appendChild(connectorInCopy);
        connectorInCopy.name = 'Arrow';
        connectorInCopy.visible = true;

        connectorInCopy.connectorLineType = 'ELBOWED';
        connectorInCopy.connectorStart = makeEndpoint(node1, node2, connectorParent);
        connectorInCopy.connectorEnd = makeEndpoint(node2, node1, connectorParent);

        if (figma.command === 'connector') {
          connectorInCopy.text.characters = '';
        }

        figma.currentPage.selection = [connectorInCopy];
        success = true;
        figma.notify('Коннектор создан');
      }
    } finally {
      if (!success && connectorInCopy) connectorInCopy.remove();
      frameCopy.remove();
    }
  } catch (error) {
    figma.notify('Ошибка при создании коннектора: ' + (error as Error).message);
  }

  figma.closePlugin();
}

main();
