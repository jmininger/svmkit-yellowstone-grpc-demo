use color_eyre::Result;
use solana_client::{
    rpc_client::RpcClient, rpc_config::RpcRequestAirdropConfig, rpc_response::Response,
};
use solana_sdk::{
    commitment_config::CommitmentConfig, program_pack::Pack, signature::Keypair, signer::Signer,
    system_instruction, transaction::Transaction,
};
use spl_token::{
    instruction::{initialize_mint, mint_to},
    state::Mint,
};

#[tokio::main]
async fn main() -> Result<()> {
    color_eyre::install()?;

    let kp = Keypair::new();
    println!("Public key: {}", kp.pubkey());

    // Fund the Keypair
    let rpc_client = RpcClient::new("http://localhost:8899");
    let signature = rpc_client.request_airdrop_with_config(
        &kp.pubkey(),
        1_000_000_000,
        RpcRequestAirdropConfig {
            recent_blockhash: None,
            commitment: Some(CommitmentConfig::finalized()),
        },
    )?;
    let mut res: Response<bool> = rpc_client
        .confirm_transaction_with_commitment(&signature, CommitmentConfig::finalized())?;
    while !res.value {
        println!("Sleeping");
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        res = rpc_client
            .confirm_transaction_with_commitment(&signature, CommitmentConfig::finalized())?;
    }

    // Create a new keypair for the mint
    let mint_keypair = Keypair::new();
    let mint_pubkey = mint_keypair.pubkey();
    let decimals = 6; // e.g., 6 decimal places like USDC

    // Calculate minimum balance for rent exemption
    let rent = rpc_client.get_minimum_balance_for_rent_exemption(Mint::LEN)?;

    println!("Mint keypair {}", mint_keypair.pubkey());
    println!("RENT: {}", rent);
    // Create the mint account
    let create_account_ix = system_instruction::create_account(
        &kp.pubkey(),
        &mint_pubkey,
        rent,
        Mint::LEN as u64,
        &spl_token::id(),
    );

    // Initialize the mint
    let initialize_mint_ix = initialize_mint(
        &spl_token::id(),
        &mint_pubkey,
        &kp.pubkey(), // Mint authority
        None,         // Optional freeze authority
        decimals,
    )?;

    // Build and send the transaction
    let recent_blockhash = rpc_client.get_latest_blockhash()?;
    let balance = rpc_client.get_balance(&kp.pubkey())?;
    println!("Balance: {}", balance);
    let tx = Transaction::new_signed_with_payer(
        &[create_account_ix, initialize_mint_ix],
        Some(&kp.pubkey()),
        &[&kp, &mint_keypair],
        recent_blockhash,
    );
    let signature = rpc_client.send_and_confirm_transaction(&tx)?;
    println!("Mint created with signature: {}", signature);

    // TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA

    Ok(())
}
