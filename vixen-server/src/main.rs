use std::future::Future;

use yellowstone_vixen::{
    self as vixen,
    vixen_core::{self},
    HandlerResult, Pipeline,
};

fn id() -> vixen_core::Pubkey {
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        .parse()
        .unwrap()
}

#[derive(Debug)]
pub enum StakeAccountUpdate {
    Account,
}

#[derive(Debug)]
pub struct Parser;

impl vixen_core::Parser for Parser {
    type Input = vixen_core::AccountUpdate;
    type Output = StakeAccountUpdate;

    fn id(&self) -> std::borrow::Cow<str> {
        "test_stream::Parser".into()
    }

    fn prefilter(&self) -> vixen_core::Prefilter {
        vixen_core::Prefilter::builder()
            .account_owners([id()])
            .build()
            .unwrap()
    }

    async fn parse(&self, value: &Self::Input) -> vixen_core::ParseResult<Self::Output> {
        todo!();
    }
}

#[derive(Debug)]
struct PrinterHandler;
impl vixen::handler::Handler<StakeAccountUpdate> for PrinterHandler {
    fn handle(&self, value: &StakeAccountUpdate) -> impl Future<Output = HandlerResult<()>> + Send {
        async move {
            println!("Received {:?}", value);
            Ok(())
        }
    }
}

impl vixen_core::ProgramParser for Parser {
    fn program_id(&self) -> vixen_core::Pubkey {
        id()
    }
}

fn main() {
    let config = std::fs::read_to_string("config.toml").expect("Error reading config file");
    let config = toml::from_str(&config).expect("Error parsing config");

    vixen::Runtime::builder()
        .account(Pipeline::new(Parser, [PrinterHandler]))
        .build(config)
        .run();
}
