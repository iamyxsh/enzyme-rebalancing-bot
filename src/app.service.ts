import { Injectable } from '@nestjs/common';
import {
  callOnIntegrationArgs,
  uniswapV3TakeOrderArgs,
  IntegrationManagerActionId,
  takeOrderSelector,
  ComptrollerLib,
} from '@enzymefinance/protocol';
import axios from 'axios';
import { getEnvironment } from '@enzymefinance/environment/all';
import { ethers, Wallet } from 'ethers';
import { getRevertError, uniswapV3Price } from './utils';
import { Network, getDeployment, AssetType } from '@enzymefinance/environment';

@Injectable()
export class AppService {
  ping(): string {
    return 'pong!';
  }

  async swap(): Promise<any> {
    try {
      const provider = new ethers.providers.JsonRpcBatchProvider(
        'https://1rpc.io/matic',
      );
      const env = getEnvironment(getDeployment(Network.POLYGON).slug);
      const wallet = new Wallet(process.env.PRIVATE_KEY);
      const signer = wallet.connect(provider);

      const incoming = env.getAssetAs(
        '0xb33eaad8d922b1083446dc23f610c2567fb5180f',
        AssetType.PRIMITIVE,
      );
      const outgoing = env.getAssetAs(
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
        AssetType.PRIMITIVE,
      );
      console.log(ethers.utils.formatUnits('100000', 6));

      const uniswapPrice = await uniswapV3Price({
        environment: env,
        incoming,
        outgoing,
        quantity: 100000,
        provider: provider as any,
      });

      const takeOrderArgs = uniswapV3TakeOrderArgs({
        minIncomingAssetAmount: 0,
        outgoingAssetAmount: 100000,
        pathAddresses: uniswapPrice.path.map((item) => item.address),
        pathFees: uniswapPrice.pools.map((pool) =>
          ethers.BigNumber.from(pool.fee),
        ) as any,
      });

      const callArgs = callOnIntegrationArgs({
        adapter: env.contracts.UniswapV3Adapter,
        selector: takeOrderSelector,
        encodedCallArgs: takeOrderArgs,
      });

      const contract = new ComptrollerLib(process.env.VAULT_ADDRESS, signer);

      const tx = contract.callOnExtension.args(
        env.contracts.IntegrationManager,
        IntegrationManagerActionId.CallOnIntegration,
        callArgs,
      );

      //console.log(tx);

      await tx.call();
      // const gasLimit = (await tx.estimate()).mul(10).div(9);
      // const gasPrice = await getPolygonGasPrice();

      // const resolved = await tx.gas(gasLimit, gasPrice).send();

      // console.log(
      //   'This trade has been submitted to the blockchain. TRANSACTION HASH ==>',
      //   resolved.transactionHash,
      // );

      // console.log(
      //   `Transaction successful. You spent ${resolved.gasUsed.toString()} in gas.`,
      // );
    } catch (error) {
      console.error('THE BOT FAILED :*(. Error below: ');

      if (error.error?.data) {
        console.log(getRevertError(error.error.data));
        return;
      }

      if (error.error?.message) {
        console.log(error.error.message);
        return;
      }

      console.log(error);
    }
  }
}

export async function getPolygonGasPrice(): Promise<ethers.BigNumber> {
  try {
    const response = await axios.get(
      'https://gasstation-mainnet.matic.network/v2',
    );
    const price = ethers.utils.parseUnits(
      Math.ceil(response.data.fast.maxFee).toString(),
      'gwei',
    );

    return price;
  } catch (error) {
    throw new Error(`Failed to fetch gas price data: ${error}`);
  }
}
