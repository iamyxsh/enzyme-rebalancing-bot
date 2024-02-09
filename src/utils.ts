import type { Environment, PrimitiveAsset } from '@enzymefinance/environment';
import { Exchange } from '@enzymefinance/environment';
import { Protocol } from '@uniswap/router-sdk';
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { AlphaRouter, SwapType } from '@uniswap/smart-order-router';
import type { Pool } from '@uniswap/v3-sdk';
import { ethers } from 'ethers';
import type { Pair } from '@uniswap/v2-sdk';

import { GraphQLClient } from 'graphql-request';

export interface TokenSwapPrice {
  exchange: Exchange;
  status: string;
  amount?: ethers.BigNumberish;
  price?: number;
  bestRoute?: string;
  reason?: string;
  fastTransactionRequired?: boolean;
}

export type UniswapPrice = TokenSwapPrice & { path?: Token[]; pools?: Pool[] };

export async function uniswapV3Price({
  environment,
  incoming,
  outgoing,
  quantity,
  slippage = 3,
  provider,
}: {
  incoming: PrimitiveAsset;
  environment: Environment;
  outgoing: PrimitiveAsset;
  quantity: ethers.BigNumberish;
  slippage?: number;
  provider: ethers.providers.JsonRpcProvider;
}): Promise<UniswapPrice> {
  try {
    const chainId = Number(environment.network.id);
    const router = new AlphaRouter({ chainId, provider: provider as any });

    if (incoming.id === outgoing.id) {
      console.log('Assets are identical');
      throw new Error('Assets are the identical');
    }

    const tokenA = new Token(
      chainId,
      ethers.utils.getAddress(outgoing.id),
      outgoing.decimals,
    );
    const tokenB = new Token(
      chainId,
      ethers.utils.getAddress(incoming.id),
      incoming.decimals,
    );

    const tokenAAmount = CurrencyAmount.fromRawAmount(
      tokenA,
      quantity.toString(),
    );

    const route = await router.route(
      tokenAAmount,
      tokenB,
      TradeType.EXACT_INPUT,
      {
        recipient: environment.contracts.IntegrationManager,
        slippageTolerance: new Percent(Math.floor(slippage * 100), 100),
        type: SwapType.UNIVERSAL_ROUTER,
      },
      {
        protocols: [Protocol.V3],
      },
    );

    if (!route) {
      console.log('No uniswap alpha router route found');
      throw new Error('No uniswap alpha router route found');
    }

    const price =
      Number(route.quote.toExact()) /
      Number(
        ethers.utils.formatUnits(
          ethers.BigNumber.from(quantity).toString(),
          tokenA.decimals,
        ),
      );

    const bestRoute =
      route.trade.routes[0].path
        .map((item) => getSymbol(environment, item))
        .join(' > ') || '';

    return {
      amount: ethers.utils.parseUnits(
        route.quote.toFixed(tokenB.decimals),
        tokenB.decimals,
      ),
      bestRoute,
      exchange: Exchange.UNISWAP_V3,
      price,
      status: 'OK',
      path: route.trade.routes[0].path,
      pools: route.trade.routes[0].pools.filter(isPool),
    };
  } catch (error) {
    console.log('Uniswap price error: ', error);

    return {
      exchange: Exchange.UNISWAP_V3,
      reason: 'No price',
      status: 'ERROR',
    };
  }
}

export function getSymbol(environment: Environment, token: Token) {
  const address = token.address.toLowerCase();

  return environment.hasAsset(address)
    ? environment.getAsset(address).symbol
    : token.symbol;
}

function isPool(candidate: Pair | Pool): candidate is Pool {
  return 'fee' in candidate;
}

import { utils } from 'ethers';

const defaultRevertError =
  'The call was reverted without providing further details.';

export function getRevertError(error: string): string {
  if (error === 'Reverted') {
    return defaultRevertError;
  }

  const encodedPrefix = 'Reverted 0x';
  if (error.startsWith(encodedPrefix)) {
    const bytes = `0x${error.substr(encodedPrefix.length)}`;

    try {
      const stringified = utils.toUtf8String('0x' + bytes.substr(138));
      return getRevertError(stringified);
    } catch {}

    return defaultRevertError;
  }

  return error;
}
