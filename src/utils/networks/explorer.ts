import { serialize } from '@/action/box';
import { AddressDbAction, BoxDbAction, BoxSpendAction } from '@/action/db';
import ergoExplorerClientFactory, { V1 } from '@rosen-clients/ergo-explorer';
import * as wasm from 'ergo-lib-wasm-browser';
import Address from '@/db/entities/Address';
import { TokenInfo } from '@/types/db';
import { JsonBI } from '../json';
import { AbstractNetwork } from './abstractNetwork';
import { BalanceInfo } from './interfaces';

class ErgoExplorerNetwork extends AbstractNetwork {
  private readonly client;
  private static MAX_ALLOWED_TX_PER_PAGE = 100;

  constructor(url: string) {
    super();
    this.client = ergoExplorerClientFactory(url);
  }

  getHeight = async (): Promise<number> => {
    const info = await this.client.v1.getApiV1Info();
    return info.height;
  };

  getAddressTransactionCount = async (address: string): Promise<number> => {
    const data = await this.client.v1.getApiV1AddressesP1Transactions(address, {
      limit: 1,
    });
    return data.total;
  };

  getContext = async (): Promise<wasm.ErgoStateContext> => {
    const headers = (
      await this.client.v1.getApiV1BlocksHeaders({
        offset: 0,
        limit: 10,
      })
    ).items;
    if (headers) {
      const blockHeaders = wasm.BlockHeaders.from_json(
        headers.map((item) => JsonBI.stringify(item)),
      );
      const pre_header = wasm.PreHeader.from_block_header(blockHeaders.get(0));
      return new wasm.ErgoStateContext(pre_header, blockHeaders);
    }
    throw Error('Unknown error occurred');
  };

  sendTx = async (tx: wasm.Transaction): Promise<{ txId: string }> => {
    const res = await this.client.v1.postApiV1MempoolTransactionsSubmit(
      tx.to_json() as never,
    );
    return { txId: res.id };
  };

  getAddressInfo = async (address: string): Promise<BalanceInfo> => {
    const res =
      await this.client.v1.getApiV1AddressesP1BalanceConfirmed(address);
    return {
      nanoErgs: res.nanoErgs,
      tokens: res.tokens
        ? res.tokens.map((item) => ({ id: item.tokenId, amount: item.amount }))
        : [],
    };
  };

  getAssetDetails = async (assetId: string): Promise<TokenInfo> => {
    const tokenInfo = await this.client.v1.getApiV1TokensP1(assetId);
    const boxInfo = await this.client.v1.getApiV1BoxesP1(tokenInfo.boxId);
    return {
      name: tokenInfo.name,
      boxId: tokenInfo.boxId,
      id: tokenInfo.id,
      height: boxInfo.settlementHeight,
      decimals: tokenInfo.decimals,
      description: tokenInfo.description,
      emissionAmount: tokenInfo.emissionAmount,
      txId: boxInfo.transactionId,
    };
  };

  getBoxById = async (boxId: string): Promise<wasm.ErgoBox | undefined> => {
    const boxInfo = await this.client.v1.getApiV1BoxesP1(boxId);
    if (boxInfo !== undefined) {
      return wasm.ErgoBox.from_json(JsonBI.stringify(boxInfo));
    }
  };

  protected processTransaction = async (
    tx: V1.TransactionInfo | V1.TransactionInfo1,
    address: Address,
  ) => {
    const getBoxId = (box: { boxId: string } | { id: string }) => {
      if (Object.prototype.hasOwnProperty.call(box, 'boxId'))
        return (box as { boxId: string }).boxId;
      return (box as { id: string }).id;
    };
    for (const output of tx.outputs ?? []) {
      if (output.address === address.address) {
        await BoxDbAction.getInstance().insertOrUpdateBox(
          {
            address: output.address,
            boxId: getBoxId(output),
            create: {
              index: output.index,
              tx: tx.id,
              height: tx.inclusionHeight,
              timestamp: parseInt(tx.timestamp.toString()),
            },
            serialized: serialize(
              wasm.ErgoBox.from_json(JsonBI.stringify(output)),
            ),
          },
          address,
        );
      }
    }
    for (const input of tx.inputs ?? []) {
      if (input.address === address.address) {
        await BoxSpendAction.getInstance().insertOrUpdateSpendInfo(
          {
            box_id: getBoxId(input),
            spend_height: tx.inclusionHeight,
            spend_timestamp: parseInt(tx.timestamp.toString()),
            spend_index: input.index,
            spend_tx_id: tx.id,
          },
          address.network_type,
        );
      }
    }
  };

  syncBoxes = async (address: Address): Promise<boolean> => {
    try {
      const height = await this.getHeight();
      let addressHeight = address.process_height;
      let toHeight = height;
      const proceedToHeight = async (proceedHeight: number) => {
        await AddressDbAction.getInstance().updateAddressHeight(
          address.id,
          proceedHeight,
        );
        addressHeight = proceedHeight;
        toHeight = height;
      };
      while (addressHeight < height) {
        const chunk = await this.client.v1.getApiV1AddressesP1Transactions(
          address.address,
          {
            limit: 1,
            offset: 0,
            fromHeight: addressHeight,
            toHeight: toHeight,
          },
        );
        if (chunk.total > ErgoExplorerNetwork.MAX_ALLOWED_TX_PER_PAGE) {
          if (toHeight > addressHeight + 1) {
            toHeight = Math.floor((toHeight + addressHeight) / 2);
          } else {
            const header = await this.client.v1.getApiV1BlocksHeaders({
              offset: addressHeight,
              limit: 1,
              sortBy: 'height',
              sortDirection: 'asc',
            });
            if (header.items === undefined) return false;
            const block = await this.client.v1.getApiV1BlocksP1(
              header.items[0].id,
            );
            for (const tx of block.block.blockTransactions ?? []) {
              await this.processTransaction(tx, address);
            }
            await proceedToHeight(toHeight);
          }
        } else {
          const chunk = await this.client.v1.getApiV1AddressesP1Transactions(
            address.address,
            {
              limit: ErgoExplorerNetwork.MAX_ALLOWED_TX_PER_PAGE,
              offset: 0,
              fromHeight: addressHeight,
              toHeight: toHeight,
            },
          );
          for (const tx of chunk.items ?? []) {
            await this.processTransaction(tx, address);
          }
          await proceedToHeight(toHeight);
        }
      }
      const boxes = await BoxDbAction.getInstance().getAddressUnspentBoxes([
        address.id,
      ]);
      for (const box of boxes) {
        const spend = await BoxSpendAction.getInstance().getSpendInfoForBox(
          box.box_id,
          address.network_type,
        );
        if (spend) {
          await BoxDbAction.getInstance().spendBox(box.box_id, {
            height: spend.spend_height,
            timestamp: spend.spend_timestamp,
            index: spend.spend_index,
            tx: spend.spend_tx_id,
          });
        }
        await BoxSpendAction.getInstance().deleteSpendInfo(
          box.box_id,
          address.network_type,
        );
      }
    } catch (e) {
      console.error(e);
      return false;
    }
    return true;
  };

  getUnspentBoxByTokenId = async (
    tokenId: string,
    offset: number,
    limit: number,
  ): Promise<Array<wasm.ErgoBox>> => {
    const boxes = await this.client.v1.getApiV1BoxesUnspentBytokenidP1(
      tokenId,
      { offset, limit },
    );
    if (boxes.items !== undefined) {
      return boxes.items.map((item) =>
        wasm.ErgoBox.from_json(JsonBI.stringify(item)),
      );
    }
    return [];
  };

  trackMempool = async (box: wasm.ErgoBox): Promise<wasm.ErgoBox> => {
    return box;
  };
}

export default ErgoExplorerNetwork;
