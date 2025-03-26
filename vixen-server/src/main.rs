use std::{fs::read_to_string, path::PathBuf};

use clap::Parser as _;
use color_eyre::Result;
use yellowstone_vixen::{self as vixen, proto::parser, vixen_core::proto::Proto};
use yellowstone_vixen_parser::{
    token_extension_program::{
        AccountParser as TokenExtensionProgramAccParser,
        InstructionParser as TokenExtensionProgramIxParser,
    },
    token_program::{
        AccountParser as TokenProgramAccParser, InstructionParser as TokenProgramIxParser,
    },
};

#[derive(clap::Parser)]
#[command(version, author, about)]
pub struct Opts {
    #[arg(long, short)]
    config: PathBuf,
}

#[tokio::main]
async fn main() -> Result<()> {
    color_eyre::install()?;

    let Opts { config } = Opts::parse();
    let config = read_to_string(config).expect("Error reading config file");
    let config = toml::from_str(&config).expect("Error parsing config");

    vixen::stream::Server::builder()
        .descriptor_set(parser::DESCRIPTOR_SET)
        .account(Proto::new(TokenExtensionProgramAccParser))
        .account(Proto::new(TokenProgramAccParser))
        .instruction(Proto::new(TokenProgramIxParser))
        .instruction(Proto::new(TokenExtensionProgramIxParser))
        .build(config)
        .try_run_async()
        .await?;
    Ok(())
}
