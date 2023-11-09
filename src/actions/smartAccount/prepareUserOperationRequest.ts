import type { Chain, Client, Transport } from "viem"
import { estimateFeesPerGas } from "viem/actions"
import type { SmartAccount } from "../../accounts/types.js"
import type { GetAccountParameter, PartialBy, UserOperation } from "../../types/index.js"
import { getAction } from "../../utils/getAction.js"
import { AccountOrClientNotFoundError, parseAccount } from "../../utils/index.js"
import { sponsorUserOperation } from "./sponsorUserOperation.js"

export type PrepareUserOperationRequestParameters<
    TAccount extends SmartAccount | undefined = SmartAccount | undefined,
> = {
    userOperation: PartialBy<
        UserOperation,
        | "nonce"
        | "sender"
        | "initCode"
        | "callGasLimit"
        | "verificationGasLimit"
        | "preVerificationGas"
        | "maxFeePerGas"
        | "maxPriorityFeePerGas"
        | "paymasterAndData"
        | "signature"
    >
} & GetAccountParameter<TAccount>

export type PrepareUserOperationRequestReturnType = UserOperation

export async function prepareUserOperationRequest<
    TTransport extends Transport = Transport,
    TChain extends Chain | undefined = Chain | undefined,
    TAccount extends SmartAccount | undefined = SmartAccount | undefined
>(
    client: Client<TTransport, TChain, TAccount>,
    args: PrepareUserOperationRequestParameters<TAccount>
): Promise<PrepareUserOperationRequestReturnType> {
    const { account: account_ = client.account, userOperation: partialUserOperation } = args
    if (!account_) throw new AccountOrClientNotFoundError()

    const account = parseAccount(account_) as SmartAccount

    const [sender, nonce, initCode, signature, callData, gasEstimation] = await Promise.all([
        partialUserOperation.sender || account.address,
        partialUserOperation.nonce || account.getNonce(),
        partialUserOperation.initCode || account.getInitCode(),
        partialUserOperation.signature || account.getDummySignature(),
        partialUserOperation.callData,
        !partialUserOperation.maxFeePerGas || !partialUserOperation.maxPriorityFeePerGas
            ? estimateFeesPerGas(account.client)
            : undefined
    ])

    const userOperation: UserOperation = {
        sender,
        nonce,
        initCode,
        signature,
        callData,
        paymasterAndData: "0x",
        maxFeePerGas: partialUserOperation.maxFeePerGas || gasEstimation?.maxFeePerGas || 0n,
        maxPriorityFeePerGas: partialUserOperation.maxPriorityFeePerGas || gasEstimation?.maxPriorityFeePerGas || 0n,
        callGasLimit: partialUserOperation.callGasLimit || 0n,
        verificationGasLimit: partialUserOperation.verificationGasLimit || 0n,
        preVerificationGas: partialUserOperation.preVerificationGas || 0n
    }

    const { paymasterAndData, callGasLimit, verificationGasLimit, preVerificationGas } = await getAction(
        client,
        sponsorUserOperation
    )({
        userOperation: userOperation,
        account: account
    })

    userOperation.paymasterAndData = paymasterAndData
    userOperation.callGasLimit = callGasLimit
    userOperation.verificationGasLimit = verificationGasLimit
    userOperation.preVerificationGas = preVerificationGas

    return userOperation
}
