# V3 testnet evidence

Every payout the keeper claimed in its first run (18 Oct 2026). The live, re-verified list is at https://portalnode.timidan.xyz/api/receipts.


All 48 payouts, signed by the keeper key, each finalized with its `staking.Rewarded` event matched. Total paid to the validators: **82.4409 tPOT**; total fees: 0.7158 tPOT. An immediate rerun submitted nothing (`noop`).

**Then it kept going on its own.** From 18 Oct the agent has run on a VPS with `PORTALNODE_KEEPER=on` and claimed each new era about a minute after it closed, with no one touching it: by 25 Oct, **98 payouts and 168.86 tPOT** (eras 1 to 49, both validators). The live list, each receipt re-checked against its finalized block, is at [`/api/receipts`](https://portalnode.timidan.xyz/api/receipts).

## Validator health contract

`ValidatorHealth` ([source](../contracts/src/ValidatorHealth.sol)) on V3's EVM side (`pallet-revive`), deployed from the keeper key. Each era the keeper writes every active validator's paid-through era and liveness to it with `revive.call`; any contract reads `statusOf(bytes32)` or `isHealthy(bytes32,uint32,uint32)`.

| | |
|---|---|
| Address | `0x072a1022f537a0da496801239725539101a41bb2` (EVM RPC `https://test-evm-rpc-v3.portaldot.dev`, chain 420420777) |
| Reporter (keeper's mapped address) | `0x108c0823f35767693945b7714a93bd83f6254824` |
| Keeper top-up for the deposit | 250 tPOT, tx `0x49af489836eda416ae29184478132112bb7f4cd32f330c397b685dd3502ee105`, block `0x88bbdc6400167a33c0ccb4176dfb09b81920bd5b7a90dba78b889b0b79b81be8` |
| Deploy | `revive.instantiateWithCode`, tx `0x2be541a935ca67ee63146598fe71b9fe54c7254fcc16e5084ad84cb21aa17705`, block 181,327 ([Node Console](https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/0xcac13a8520efa94aae9385e64378dce6fdd0016ca12fd55de54de06bf8e721a9)); storage deposit 218.48 tPOT |
| First report (era 50) | `revive.call`, tx `0xf9d5947ffb1a9e5875942deed65840495e1b6570d3fd03aa95a82b6a36723c5c`, block 181,352 ([Node Console](https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/0x071ee8af96f9944ce8975aa2570905241e16c2e6d78c536a8848e220d45fe7dd)) |
| Read back | both validators: era 50, paid through 49, online; `isHealthy(…, 50, 48)` = true |

## First run, 18 Oct

Open any receipt in Portaldot's own explorer: `https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/<finalized block hash>`. For example, the [first payout](https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/0x8a413a135c18c6ec2349f16a3c24aa635f359db1ce7cf642e66d89f04590f62f) shows `staking.payoutStakersByPage`, `staking.PayoutStarted`, `staking.Rewarded` and `ExtrinsicSuccess` in block 90,847.

<details><summary>Show all 48 receipts</summary>

| Era | Validator | Page | Tx hash | Finalized block hash | Extrinsic | Paid (tPOT) |
|---|---|---|---|---|---|---|
| 1 | 5F4ZyJ…BfYY | 0 | `0x9825048e2bcedfdad5f7b7b595aeebd556207086c077271b15103f0f8b128452` | `0x8a413a135c18c6ec2349f16a3c24aa635f359db1ce7cf642e66d89f04590f62f` | 1 | 1.7050 |
| 1 | 5Grj5u…hwjk | 0 | `0xf026e3fd00828643ecb739b7c1a1d0e06010e95457175a9f71d2c75d6c1bf11a` | `0x4ae8f1da4bf1c07ae8d2e2de5c40da6c3e9dffff1a9df085122f497be9cde237` | 1 | 1.7300 |
| 2 | 5F4ZyJ…BfYY | 0 | `0xfcd66d1769505c3be3989fca93537d5b6fcbab77e78f5e71ea2b8f2de3da133d` | `0x763b4144018f2279bf923ed7a7aeda0b452dc73e5b64dc8aa97362a2513b0996` | 1 | 1.7122 |
| 2 | 5Grj5u…hwjk | 0 | `0x509aa2b6a16547383752a6f33e17edcbe2e5ea14c06eb85e87e89f4f0da58df4` | `0xf33866976c85748964b4ecf00ae2547b29068f23f5899dff184b15b7c633a412` | 1 | 1.7227 |
| 3 | 5F4ZyJ…BfYY | 0 | `0x8378f884efab75ab0c5b95b91b01e99786f41f5ed480c60590bc4c42c4a985bd` | `0x2a8cd807b30371472ece1ba177df1444d12a9bc2575f8a4c3fc1cee71cc2bfc0` | 1 | 1.7468 |
| 3 | 5Grj5u…hwjk | 0 | `0x7c08150a9a7d652d617f84e1ddf604381e963b64f1e9f39bf82c645ae8c663bb` | `0x79c009a65b98f97a6bb4c2452b6aba6ae62661bb9ff6000aaf3a43f59ff97d00` | 1 | 1.6881 |
| 4 | 5F4ZyJ…BfYY | 0 | `0x85e44aa807a5acdcea7531b689eb132e6a593a0c8d163e18a95b70bb01ee4aab` | `0xf99a7b5ba569bc72119f539e3d66ed94bf101afc8219af49dc9392e3b6939530` | 1 | 1.7251 |
| 4 | 5Grj5u…hwjk | 0 | `0xba0a8dbd8d2f721a5ae800430ee9126914c033c79059d099b1912592045eb1a5` | `0xfa44d0fd7f32d0c1528321e0670fe3d68bdec914c81363e43061bc0b4c9770e9` | 1 | 1.7098 |
| 5 | 5F4ZyJ…BfYY | 0 | `0xf3dac013b111baa48933366bbdfde663a0399620637cd535c31d6b77a8e79c57` | `0x805a1508df93f0029ab30cb4c501a67fe1340dff0595fd09caac804149cfef91` | 1 | 1.7084 |
| 5 | 5Grj5u…hwjk | 0 | `0xb89763828c710160616318889ef0e36c540dee5db42f02780ef4842eb4df0996` | `0xeaef8241421d16542f28c4447627adb3e3a2a77ef7096e3dec92c7923f4e64df` | 1 | 1.7266 |
| 6 | 5F4ZyJ…BfYY | 0 | `0x7beb7d4f3785b79f6752a8fc551037ec11c50d3c732ac85657612c9d44428efe` | `0x3fbae791e573025d4a07bb5a5fafda9831bfa8f9b0ac615837a3b153f881a8c5` | 1 | 1.6772 |
| 6 | 5Grj5u…hwjk | 0 | `0xf135653c535e41d2d682cf57c379b4f96434d915090a87387776e2695fd1c46b` | `0x3941cffbfa7be2d178ba74a72ad4c4ce36daf25fff138a84dbb141f63e8159f7` | 1 | 1.7577 |
| 7 | 5F4ZyJ…BfYY | 0 | `0x664435299ac59c4083c675c233201204d911e5a892305dd5d3b4a8fb1c05a59c` | `0x85c42053ea33dc2f61dffeb10b3092a1138007e5ab1537d9b6cc35d04968d863` | 1 | 1.7362 |
| 7 | 5Grj5u…hwjk | 0 | `0x46a8f6f2e4abb7d122147f2d1d97493b66791373c366e56e6894d98be9bdb5b3` | `0x73b2922e33a9103eb9f1573e8278af24f7216088f38ff94bf2367615c820f443` | 1 | 1.6988 |
| 8 | 5F4ZyJ…BfYY | 0 | `0x8f580ba1193c042103c782b1ccb3ad1fbc949f0ee1d0d912eba16e7b9f39524b` | `0xcd58f52f1cabc626c0d8f19cbc9a40279c46c723349c9ec407cacdf428ab75e1` | 1 | 1.7175 |
| 8 | 5Grj5u…hwjk | 0 | `0x46e43052d2b34294fbcc8fa4c90af3aee60c08200e958d28c5091f5434f891b7` | `0xdb367c7ac5d5b3066aba8116d820065aa2505fbcec7375bb992bc1cf0b092d7d` | 1 | 1.7175 |
| 9 | 5F4ZyJ…BfYY | 0 | `0xfe89b04b286439f6bdca917fa0c523dfb85118f1cbda470a417ff12864fd2c1c` | `0x4442183e71b17e27b0694370bced9d2f248f82ce186e954a3b3b1f4507d012a9` | 1 | 1.7276 |
| 9 | 5Grj5u…hwjk | 0 | `0xd382074071b22fcb1de8a351b31a0d933372aae3b3dee2c255c185d5109e9272` | `0x7dfaea3c0f54df5c0cf44e6456da6b8b313842966f2c38ba16533a70a3a58ff3` | 1 | 1.7074 |
| 10 | 5F4ZyJ…BfYY | 0 | `0xe0699790abe65ee7aab409499d70105e03ac56494cf1b0b223f5e0336d798f5e` | `0xe9ddd9a4acf91e5022f2c3d4849bfabf24e472e9c8d77bd128874095a195e1a6` | 1 | 1.6954 |
| 10 | 5Grj5u…hwjk | 0 | `0x8dfe51475c6745e115a40df475cf5c7d5f6237981bfe3aee856733993889c68c` | `0x682ba6a7ec8360013db1236d7195f8b726a5e7da8337e9e971b6fc8a0cc2e631` | 1 | 1.7396 |
| 11 | 5F4ZyJ…BfYY | 0 | `0x0618771a6789b3f4aabe9c500c3b89e6630c6c82ef5ec4ea3def033ccce238c4` | `0xbf27dbd6ff7f27271295d2fa6b883f8288d0d8fdc3c4ecf27b6c0ba7aedf8e5d` | 1 | 1.7141 |
| 11 | 5Grj5u…hwjk | 0 | `0x639a83bed384676be143bbaffcade72580f5642b80df4a72cd659801647d2499` | `0x165a91f24371166573122324fb4f019096c92205f8e2d223790f27a18e0e343b` | 1 | 1.7208 |
| 12 | 5F4ZyJ…BfYY | 0 | `0x3653cdd8154ad5b403f36de1ae5e81c8f73c4a3e12a597b3afb5fbb4de7ddd1e` | `0xe5b15270542331b9c5f7e398a4ab095051a1bc08169238f8420c9d13071ceda6` | 1 | 1.6834 |
| 12 | 5Grj5u…hwjk | 0 | `0xa51a1a86a2685d50c9f8aa35bceeebe94d8cd0e8d249f00361aec30697976764` | `0xfebadd485feb2bca97a7112c81eb53f7f5efbb827c32a384bb9a99f858c79bda` | 1 | 1.7515 |
| 13 | 5F4ZyJ…BfYY | 0 | `0x8768db6643283a5be81da026c269e326f47d6910990d1f3f4f2f0bae57a320de` | `0x53f6d82f1db37c4faa4ba2f2e196ab026f141795fb5c5e52d0f4971f51e3f485` | 2 | 1.6925 |
| 13 | 5Grj5u…hwjk | 0 | `0xce6a8537128df5612634616bb7a3bcf9f2986ee5722216e91909bd493fd052a5` | `0x43d01286bc885e2595ea77f01c29a178101bd8265b1f031ceb5a027e4d4264e8` | 2 | 1.7425 |
| 14 | 5F4ZyJ…BfYY | 0 | `0x8fc80b2cebb251d75216c042e29c2a715738ca01844f8a31bbfc1f5c72bbbb52` | `0x9fa4280c12d8e9aa3e3a8ab5275ae1012914dc9d7bbf2881098d3d7c38a4fb29` | 1 | 1.7501 |
| 14 | 5Grj5u…hwjk | 0 | `0xdff3680ae8cd479a40c1b668ad1998fdee94f3b2f32b0b5f4328a4f42a1eb06a` | `0xd93b5b1a52b7c109aa14518ca78fa10ef4cf2263b8433b99158d81c76a960ad6` | 1 | 1.6848 |
| 15 | 5F4ZyJ…BfYY | 0 | `0x6b15d2577932ede8561577db2dfa825b0b5dd96645c59452811f81d4cdbd62ac` | `0xf333faf1d8e87569881440d7eca6a0827390a5e31dd829d9868daeebc26f050c` | 2 | 1.7127 |
| 15 | 5Grj5u…hwjk | 0 | `0xb2c958eabd5b728c1d4a9c961af8a01a89a8d3d48dee4f6a582600f6bb4967e7` | `0x4a187926aaedeff5b93a48e61ad8c30c19f7c3db820bd8a5e903dd15b0ba2414` | 1 | 1.7223 |
| 16 | 5F4ZyJ…BfYY | 0 | `0x15f6d270e97f77512a7c605263a42be566a2677532c697ec9acc3035113d054a` | `0xa17751a3845807410521760ad50fc38421b563bd76e5cea7121cb81c499162c2` | 1 | 1.7281 |
| 16 | 5Grj5u…hwjk | 0 | `0x63a07cef75a5c5e7ad07c549aebcd8196dfab2f3281d5ac6d237cdcd1171c99b` | `0xa0368bdeb0e7f136b2f37f7e0ae9809f552e0b2e7068d209b446d46933e05a55` | 1 | 1.7069 |
| 17 | 5F4ZyJ…BfYY | 0 | `0x15b0d2ee3fb040185852faac06849200375b0251a0bc6c79613dd3f54a994b71` | `0xe2e10b3f619e12acf3ab38227adac02b5207e84e79e4f4a481a7aebfef85556c` | 1 | 1.6674 |
| 17 | 5Grj5u…hwjk | 0 | `0x3c6513e71e0e34621dcf80d6f4d1e015ad2c75658563a1045b9e518123435d69` | `0xb5698471af6bf0a891d1e008c3d498333da319bca2a105a493ce28adce8c0594` | 1 | 1.7675 |
| 18 | 5F4ZyJ…BfYY | 0 | `0xd0cf0914adbcac5dc7efbcbfa8dcdc3bfc6a3f80a92d2d470dad760f7d630141` | `0xa417248b3dfb523e569ddd0735af3eb0fe3198ec623e0eca939470d9fca6f4b9` | 1 | 1.7694 |
| 18 | 5Grj5u…hwjk | 0 | `0xde3c55a02f873243d3885fb64de6d0c18de362daf11d3bd50259ac0c8834d973` | `0xaf932a43ec3bb52122c830941ad99d70c8b6d37ff8b07382dbfcb127ef4fda33` | 1 | 1.6656 |
| 19 | 5F4ZyJ…BfYY | 0 | `0x58244c39d9129531a26f8566d2fb3b1bd27bcb7a9792d712aeb0e24bd732e9e6` | `0xda405f65b0d26beac887a5857180668c5d2f0afcb480f96d8476894bffbe1de4` | 1 | 1.7055 |
| 19 | 5Grj5u…hwjk | 0 | `0x0c8e338a764003e95b2e894d391285577f236b2b03a861dddc65e7a04e587247` | `0x443310381d9098530975c1e28e7e139c6e2a69275391497cc34856a26d738678` | 1 | 1.7295 |
| 20 | 5F4ZyJ…BfYY | 0 | `0xfafa77ed18548733a4fde5dec7570c3416ad395988c3a37c34226d80498ba2ec` | `0x9e04f70ad852c3034c7e769d9b625a85c358ba91b448129d31beb260b50d6422` | 1 | 1.6810 |
| 20 | 5Grj5u…hwjk | 0 | `0xa983df1bed3bb096eaed3be7706f2e5c1dcd7d4393aa2f204b32860c171e5ce2` | `0x232d2ba9e843e0cfb6a1345d3d0bd1f1332113b2c3360c5bd38d711a105d6f6d` | 1 | 1.7539 |
| 21 | 5F4ZyJ…BfYY | 0 | `0x822d392ae79a50fc4596ce087bbe3f5bbdb2a6544937b95681f77ae910d1c505` | `0x3341f9801e203362b79dffd8061184a8e63e42d89e58cb9d6aa689872f7f4fed` | 1 | 1.6877 |
| 21 | 5Grj5u…hwjk | 0 | `0x2a2e1d0faa206d95388d4101d98c71ff8aa9da04cbdc05f9e21fb2bfec10d77f` | `0xb233152949497922ba6f8ee3c3981d8fe91311e1bb47bb93b10ce6a655a2f56b` | 1 | 1.7473 |
| 22 | 5F4ZyJ…BfYY | 0 | `0xb3da3fc427c3c237cef4ca2a26af8756f8cc946704c10e12fcb3d682195685ee` | `0xff18db4ca1774cc4378ba8e07b1b0dfebc03a9998c266add9fc639d6cbf7737a` | 1 | 1.6931 |
| 22 | 5Grj5u…hwjk | 0 | `0x03b404a61ba53ce9217162db0be23dbac93ac329a9b4175d25a38e70cbea2d58` | `0x5e63741f65a32f109e70e084d8ab16b6ef0dfb4828ff8e330f9d0605f39ff371` | 1 | 1.7419 |
| 23 | 5F4ZyJ…BfYY | 0 | `0xff3a6044c64a0d54c7408e3c529288d18bd81693de3dccf58d5360d6da85f1af` | `0xc5ed26199e00452b72928817a35cf67ca13e31b122ae3307f55dbe03a2997598` | 1 | 1.7314 |
| 23 | 5Grj5u…hwjk | 0 | `0xb6eb8f5ae139099b965346a4790bb1116c42e0dc32e6d73a24264782156ffd3d` | `0x8d39163409ecf5558fefe70f131227fe676bd6515359594a8351a08e4fde247a` | 1 | 1.7036 |
| 24 | 5F4ZyJ…BfYY | 0 | `0xb69bbad363baf605c6a1f4805affbe8767fc240bfa211d7435dbf8ebc9b7e787` | `0x739475d496dddcbc69ec71e893e31e91e55b385102494706c20d3553ad1e584a` | 1 | 1.7669 |
| 24 | 5Grj5u…hwjk | 0 | `0xcf77ce668bd798a723ed540a9c1941c12d293fa36a300b228aa163d49121542f` | `0x0ef938616150b4a8aa6b30c04bdf1f6e4fc99f81426f7758aeec519be873f565` | 1 | 1.6681 |

</details>

