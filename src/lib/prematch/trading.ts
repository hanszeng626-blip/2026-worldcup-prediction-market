import type { OddsMarket } from './types';

export interface TradingQuote {
  marketId: string;
  outcome: string;
  price: number;
  availableSize: number;
  fetchedAt: string;
}

export interface TradingOrderRequest {
  marketId: string;
  outcome: string;
  stake: number;
  maxPrice: number;
}

export interface TradingOrderResult {
  accepted: boolean;
  orderId?: string;
  reason?: string;
}

export interface TradingProvider {
  listMarkets(fixtureId: string): Promise<OddsMarket[]>;
  getQuote(marketId: string, outcome: string): Promise<TradingQuote>;
  placeSimulatedOrder(order: TradingOrderRequest): Promise<TradingOrderResult>;
  placeRealMoneyOrder(order: TradingOrderRequest): Promise<TradingOrderResult>;
}

export function isRealMoneyTradingEnabled(): false {
  return false;
}

export const disabledTradingProvider: TradingProvider = {
  async listMarkets() {
    return [];
  },
  async getQuote(marketId, outcome) {
    return {
      marketId,
      outcome,
      price: 0,
      availableSize: 0,
      fetchedAt: new Date().toISOString(),
    };
  },
  async placeSimulatedOrder() {
    return { accepted: true, orderId: `SIM-${Date.now()}` };
  },
  async placeRealMoneyOrder() {
    return {
      accepted: false,
      reason: '真实资金交易未启用：缺少持牌交易平台、KYC、地理围栏和合规审计。',
    };
  },
};

